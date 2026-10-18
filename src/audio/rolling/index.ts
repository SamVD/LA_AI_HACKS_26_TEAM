// SttService for all three steps (T-202). Step 1 utterances, the mic and the
// local VAD speech state come from T-104's ElevenLabsStt unchanged; this adds
// the rolling transcript for Steps 2-3 on start()/stop():
//   - 'realtime' (default, S-1): Scribe realtime WebSocket (./realtime.ts)
//   - 'batch' (PLAN §9 fallback, until a packaged build proves `wss://` passes
//     the Even whitelist): VAD-segmented utterances through batch STT, back to back.
// Select with VITE_ROLLING_STT=batch at pack time.
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import type { Speaker, SttService, Transcript, UtteranceOptions, WordEntry } from '../../core/types'
import { createGlassesMic } from '../capture'
import { sttTokenUrl } from '../index'
import type { MicSource } from '../mic'
import { ElevenLabsStt, type ElevenLabsSttOptions } from '../stt'
import { TokenProvider } from '../token'
import { RealtimeTranscriber, type SocketFactory } from './realtime'

export { TranscriptBuffer } from './buffer'
export { RealtimeTranscriber, cleanKeyterms, realtimeUrl, type SocketFactory, type SocketLike } from './realtime'

export type RollingMode = 'realtime' | 'batch'

/**
 * G3 re-run (#120): batch segments that are almost certainly not the wearer's words.
 * - `non-latin`: mostly non-Latin letters. Scribe hallucinated Malayalam/Chinese on short
 *   clips although we send `language_code=en`.
 * - `short-quiet`: under 500 ms of speech **and** below -22 dB. Partner fragments ("to" at
 *   -24 dB) triggered false stalls and spent prediction quota. The wearer measured -9 to -15 dB.
 * Returns the reason to drop the segment, or null to keep it.
 */
export function junkReason(text: string, level: { speechDb: number; speechMs: number } | null): 'non-latin' | 'short-quiet' | null {
  const letters = text.match(/\p{L}/gu) ?? []
  const nonLatin = letters.filter(ch => !/\p{Script=Latin}/u.test(ch)).length
  if (letters.length && nonLatin / letters.length > 0.3) return 'non-latin'
  if (level && level.speechMs < 500 && level.speechDb < -22) return 'short-quiet'
  return null
}

type Env = Record<string, unknown>
const defaultEnv = () => (import.meta as ImportMeta & { env?: Env }).env ?? {}

export function rollingMode(env: Env = defaultEnv()): RollingMode {
  return env.VITE_ROLLING_STT === 'batch' ? 'batch' : 'realtime'
}

/** D2: realtime keyterms are the personal bank's names, medications and places. */
export function personalKeyterms(bank: WordEntry[]): string[] {
  return bank.filter(w => w.category === 'person' || w.category === 'medication' || w.category === 'place').map(w => w.word)
}

/** The hosted minter takes the type in the body; the dev spike server takes it in the path. */
export function realtimeTokenUrl(batchUrl: string): string {
  return batchUrl.replace(/batch_scribe$/, 'realtime_scribe')
}

export interface RollingSttOptions {
  base: ElevenLabsStt
  mic: MicSource
  realtimeTokens: TokenProvider
  mode?: RollingMode
  keyterms?: () => string[] | Promise<string[]>
  now?: () => number
  log?: (event: string, data?: unknown) => void
  socket?: SocketFactory
  /** Batch fallback: one rolling utterance ends after this much silence. */
  segmentSilenceMs?: number
  /** T-314: when set, each emitted final is tagged `other` below this speechDb. Unset = no tagging. */
  speakerSplitDb?: number
}

export class RollingStt implements SttService {
  private readonly realtime: RealtimeTranscriber | null
  private running = false
  private loop: Promise<void> | null = null
  /** Resolves once the batch segment being recorded has been handled (its final emitted, if any). */
  private segmentDone: Promise<void> | null = null
  /** Cuts the batch loop's error backoff short, so stop() never waits up to 15 s on it. */
  private wake: (() => void) | null = null

  constructor(private readonly o: RollingSttOptions) {
    this.realtime = (o.mode ?? 'realtime') === 'realtime'
      ? new RealtimeTranscriber({
        mic: o.mic, tokens: o.realtimeTokens, keyterms: o.keyterms, now: o.now, log: o.log, socket: o.socket,
        emit: t => o.base.emitTranscript(t),
      })
      : null
  }

  get stats() { return this.realtime?.stats }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    await this.o.base.start() // opens the mic and starts local VAD speech state
    if (this.realtime) await this.realtime.start()
    else this.loop = this.batchLoop()
  }

  async stop(): Promise<void> {
    this.running = false
    this.wake?.()
    await this.realtime?.stop()
    await this.o.base.stop() // also cancels a batch utterance in flight
    await this.loop
    this.loop = null
  }

  /**
   * T-208 (CONTRACT_VERSION 3): end the batch segment being recorded now and resolve once
   * its final has gone out through onTranscript, so a help tap includes the words just
   * spoken instead of waiting for the ~0.8 s pause. Resolves at once when nothing with
   * speech is buffered, when stopped, and in realtime mode (the server's VAD commits there).
   * Never rejects; the batch loop keeps running. Callers cap the wait.
   */
  async flush(): Promise<void> {
    if (!this.running || this.realtime) return
    const done = this.segmentDone
    if (!done || !this.o.base.endUtterance()) return
    await done
  }

  onTranscript(cb: (t: Transcript) => void) { return this.o.base.onTranscript(cb) }
  onSpeechState(cb: Parameters<SttService['onSpeechState']>[0]) { return this.o.base.onSpeechState(cb) }
  transcribeUtterance(opts: UtteranceOptions) { return this.o.base.transcribeUtterance(opts) }

  private async batchLoop(): Promise<void> {
    let failures = 0
    while (this.running) {
      let segmentHandled!: () => void
      this.segmentDone = new Promise<void>(resolve => { segmentHandled = resolve })
      const t = await this.o.base.transcribeUtterance({ maxMs: 15_000, endSilenceMs: this.o.segmentSilenceMs ?? 800 })
      if (!this.running) { segmentHandled(); return }
      if (t.text.trim() && !t.error) {
        failures = 0
        const level = this.o.base.lastLevel
        const junk = junkReason(t.text, level)
        if (junk) this.o.log?.('rolling.drop', { reason: junk, ...level, text: t.text.trim() })
        else if (this.o.speakerSplitDb === undefined) {
          this.o.base.emitTranscript({ ...t, text: t.text.trim(), isFinal: true })
        } else {
          // T-314: below the split it's the partner; no level = wearer (never tag on missing data).
          const speaker: Speaker = level && level.speechDb < this.o.speakerSplitDb ? 'other' : 'wearer'
          this.o.log?.('stt.speaker', { speechDb: level?.speechDb ?? null, speechMs: level?.speechMs ?? null, speaker, text: t.text.trim() })
          this.o.base.emitTranscript({ ...t, text: t.text.trim(), isFinal: true, speaker })
        }
      }
      segmentHandled() // before any backoff, so a flush never waits on it
      if (t.text.trim() && !t.error) continue
      if (t.error && t.error !== 'no-speech') {
        this.o.log?.('rolling.batch-error', { error: t.error })
        failures++
        await new Promise<void>(resolve => {
          const timer = setTimeout(resolve, Math.min(15_000, 500 * 2 ** (failures - 1)))
          this.wake = () => { clearTimeout(timer); resolve() }
        })
        this.wake = null
      }
    }
  }
}

/**
 * The full STT for src/main.ts: ElevenLabsStt (Step 1) plus the rolling transcript
 * (Steps 2-3) on the same glasses mic. Call after the startup page exists.
 */
export function createRollingStt(
  bridge: Pick<EvenAppBridge, 'audioControl' | 'onEvenHubEvent'>,
  o: Partial<Omit<ElevenLabsSttOptions, 'mic' | 'tokens'>> & {
    tokenUrl?: string
    mode?: RollingMode
    keyterms?: () => string[] | Promise<string[]>
    socket?: SocketFactory
    speakerSplitDb?: number
  } = {},
): RollingStt {
  const { tokenUrl, mode, keyterms, socket, speakerSplitDb, ...rest } = o
  const url = tokenUrl ?? sttTokenUrl()
  const mic = createGlassesMic(bridge)
  const base = new ElevenLabsStt({
    ...rest,
    mic,
    tokens: new TokenProvider({ url, type: 'batch_scribe', fetch: rest.fetch, now: rest.now }),
  })
  return new RollingStt({
    base,
    mic,
    realtimeTokens: new TokenProvider({ url: realtimeTokenUrl(url), type: 'realtime_scribe', fetch: rest.fetch, now: rest.now }),
    mode: mode ?? rollingMode(),
    keyterms,
    now: rest.now,
    log: rest.log,
    socket,
    speakerSplitDb,
  })
}
