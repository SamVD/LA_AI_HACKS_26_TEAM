// SttService for all three steps (T-202). Step 1 utterances, the mic and the
// local VAD speech state come from T-104's ElevenLabsStt unchanged; this adds
// the rolling transcript for Steps 2-3 on start()/stop():
//   - 'realtime' (default, S-1): Scribe realtime WebSocket (./realtime.ts)
//   - 'batch' (PLAN §9 fallback, until a packaged build proves `wss://` passes
//     the Even whitelist): VAD-segmented utterances through batch STT, back to back.
// Select with VITE_ROLLING_STT=batch at pack time.
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import type { SttService, Transcript, UtteranceOptions, WordEntry } from '../../core/types'
import { createGlassesMic } from '../capture'
import { sttTokenUrl } from '../index'
import type { MicSource } from '../mic'
import { ElevenLabsStt, type ElevenLabsSttOptions } from '../stt'
import { TokenProvider } from '../token'
import { RealtimeTranscriber, type SocketFactory } from './realtime'

export { TranscriptBuffer } from './buffer'
export { RealtimeTranscriber, cleanKeyterms, realtimeUrl, type SocketFactory, type SocketLike } from './realtime'

export type RollingMode = 'realtime' | 'batch'

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
}

export class RollingStt implements SttService {
  private readonly realtime: RealtimeTranscriber | null
  private running = false
  private loop: Promise<void> | null = null

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
    await this.realtime?.stop()
    await this.o.base.stop() // also cancels a batch utterance in flight
    await this.loop
    this.loop = null
  }

  onTranscript(cb: (t: Transcript) => void) { return this.o.base.onTranscript(cb) }
  onSpeechState(cb: Parameters<SttService['onSpeechState']>[0]) { return this.o.base.onSpeechState(cb) }
  transcribeUtterance(opts: UtteranceOptions) { return this.o.base.transcribeUtterance(opts) }

  private async batchLoop(): Promise<void> {
    let failures = 0
    while (this.running) {
      const t = await this.o.base.transcribeUtterance({ maxMs: 15_000, endSilenceMs: this.o.segmentSilenceMs ?? 800 })
      if (!this.running) return
      if (t.text.trim() && !t.error) {
        failures = 0
        this.o.base.emitTranscript({ ...t, text: t.text.trim(), isFinal: true })
      } else if (t.error && t.error !== 'no-speech') {
        this.o.log?.('rolling.batch-error', { error: t.error })
        failures++
        await new Promise(resolve => setTimeout(resolve, Math.min(15_000, 500 * 2 ** (failures - 1))))
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
  } = {},
): RollingStt {
  const { tokenUrl, mode, keyterms, socket, ...rest } = o
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
  })
}
