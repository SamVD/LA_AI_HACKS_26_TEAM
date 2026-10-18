import type { SpeechState, SttErrorCode, SttService, Transcript, Unsubscribe, UtteranceOptions } from '../core/types'
import type { MicSource } from './mic'
import { BYTES_PER_MS, concatBytes } from './pcm'
import { transcribeBatch } from './scribe'
import type { TokenProvider } from './token'
import { EnergyVad, type VadOptions } from './vad'

// Real SttService (T-104): glasses-mic capture, local energy VAD for speech state,
// and Step 1 utterances through ElevenLabs batch STT. The rolling transcript for
// Steps 2-3 is T-202 (src/audio/rolling/); it feeds `emitTranscript`.
//
// Audio lives only in memory for the length of one utterance and is never stored.

export interface ElevenLabsSttOptions {
  mic: MicSource
  /** batch_scribe token provider (one token per utterance). */
  tokens: TokenProvider
  now?: () => number
  log?: (event: string, data?: unknown) => void
  fetch?: typeof fetch
  vad?: VadOptions
  /** Keep the mic open this long after an utterance, to skip the start-up lag on the next prompt. */
  keepWarmMs?: number
  /** Audio kept before detected speech onset, so soft first sounds are not clipped. */
  prerollMs?: number
  /** Audio kept after the last speech frame. */
  tailMs?: number
  sttTimeoutMs?: number
  /** No audio at all within this long after opening the mic → error 'unknown'. */
  firstAudioTimeoutMs?: number
}

type EndReason = 'silence' | 'max' | 'flush' | 'no-audio' | 'cancelled'

interface Utterance {
  endSilenceMs: number
  chunks: Uint8Array[]
  vad: EnergyVad | null
  audioT0: number
  finish: (reason: EndReason) => void
}

export class ElevenLabsStt implements SttService {
  private readonly transcripts = new Set<(t: Transcript) => void>()
  private readonly speech = new Set<(s: SpeechState) => void>()
  private readonly now: () => number
  private readonly log: (event: string, data?: unknown) => void
  private readonly keepWarmMs: number
  private readonly prerollMs: number
  private readonly tailMs: number
  private readonly sttTimeoutMs: number
  private readonly firstAudioTimeoutMs: number
  private micOpen: Promise<boolean> | null = null
  private closeTimer: ReturnType<typeof setTimeout> | null = null
  private rolling = false
  private rollingVad: EnergyVad | null = null
  private active: Utterance | null = null
  /** Level of the last transcribed utterance (T-316 data), for RollingStt's junk filter; null after a failed call. */
  lastLevel: { speechDb: number; speechMs: number } | null = null

  constructor(private readonly o: ElevenLabsSttOptions) {
    this.now = o.now ?? Date.now
    this.log = o.log ?? (() => {})
    this.keepWarmMs = o.keepWarmMs ?? 10_000
    this.prerollMs = o.prerollMs ?? 300
    this.tailMs = o.tailMs ?? 250
    this.sttTimeoutMs = o.sttTimeoutMs ?? 4000
    this.firstAudioTimeoutMs = o.firstAudioTimeoutMs ?? 3000
    o.mic.onChunk(pcm => this.onChunk(pcm))
    o.tokens.prime()
  }

  async start(): Promise<void> {
    if (this.rolling) return
    this.rolling = true
    this.rollingVad = null
    if (!(await this.acquire())) {
      this.rolling = false
      this.log('stt.mic-denied', { during: 'start' })
    }
  }

  async stop(): Promise<void> {
    this.rolling = false
    this.rollingVad = null
    this.active?.finish('cancelled')
    if (this.closeTimer) clearTimeout(this.closeTimer)
    this.closeTimer = null
    if (this.micOpen) {
      this.micOpen = null
      await this.o.mic.close()
    }
  }

  onTranscript(cb: (t: Transcript) => void): Unsubscribe {
    this.transcripts.add(cb)
    return () => { this.transcripts.delete(cb) }
  }

  onSpeechState(cb: (s: SpeechState) => void): Unsubscribe {
    this.speech.add(cb)
    return () => { this.speech.delete(cb) }
  }

  /** For the rolling transcript (T-202). */
  emitTranscript(t: Transcript): void {
    for (const cb of [...this.transcripts]) cb(t)
  }

  /**
   * End the utterance being recorded now, as if the speaker had paused, so it is
   * transcribed without waiting for `endSilenceMs` (T-208: a help tap right after
   * "um, um"). Returns false, and does nothing, when no utterance is recording or it
   * has not heard speech yet. Unlike a cancel, the audio is kept and sent.
   */
  endUtterance(): boolean {
    const u = this.active
    if (!u?.vad?.heardSpeech) return false
    u.finish('flush')
    return true
  }

  async transcribeUtterance(opts: UtteranceOptions): Promise<Transcript> {
    this.lastLevel = null
    // opts.targetHint is accepted but never sent as a keyterm (D1): biasing turns
    // near-misses ("cuh", "cop") into the target and gives false "correct" results.
    const tCall = this.now()
    this.o.tokens.prime()
    this.active?.finish('cancelled')
    if (!(await this.acquire())) {
      this.log('stt.mic-denied', { during: 'utterance' })
      this.release()
      return fail('mic-denied', tCall, this.now())
    }

    const u: Utterance = { endSilenceMs: opts.endSilenceMs, chunks: [], vad: null, audioT0: 0, finish: () => {} }
    const reason = await new Promise<EndReason>(resolve => {
      const timers = [
        setTimeout(() => u.finish('max'), opts.maxMs),
        setTimeout(() => { if (!u.chunks.length) u.finish('no-audio') }, Math.min(this.firstAudioTimeoutMs, opts.maxMs)),
      ]
      u.finish = r => {
        if (this.active !== u) return
        this.active = null
        timers.forEach(clearTimeout)
        resolve(r)
      }
      this.active = u
    })
    this.release()

    const tEnd = this.now()
    if (reason === 'cancelled') return fail('no-speech', tCall, tEnd)
    if (reason === 'no-audio') {
      this.log('stt.no-audio', { waitedMs: tEnd - tCall })
      return fail('unknown', tCall, tEnd)
    }
    const vad = u.vad
    if (!vad?.heardSpeech) {
      // For G2 triage ("the prompt sits, then moves up a cue"): was the room loud, or the voice quiet?
      // Speech must be marginDb (12) over the floor and above minSpeechDb (-50 dBFS).
      if (vad) this.log('stt.no-speech', { floorDb: Math.round(vad.noiseFloorDb), peakDb: Math.round(vad.peakDb), audioMs: vad.elapsedMs, end: reason })
      return fail('no-speech', tCall, tEnd)
    }

    // Trim to the speech plus a little context; less to upload, same transcript.
    const all = concatBytes(u.chunks)
    const from = alignEven(Math.max(0, vad.speechStartMs - this.prerollMs) * BYTES_PER_MS)
    const to = alignEven(Math.min(all.byteLength, (vad.speechEndMs + this.tailMs) * BYTES_PER_MS))
    const pcm = all.subarray(from, Math.max(from, to))
    const tStartMs = u.audioT0 + vad.speechStartMs
    const tEndMs = u.audioT0 + vad.speechEndMs

    const tok = await this.o.tokens.take()
    if (!tok.ok) {
      this.log('stt.error', { stage: 'token', error: tok.error, detail: tok.detail })
      return fail(tok.error, tStartMs, tEndMs)
    }
    const t0 = this.now()
    const r = await transcribeBatch({ pcm, token: tok.token, fetch: this.o.fetch, timeoutMs: this.sttTimeoutMs })
    const sttMs = this.now() - t0
    if (!r.ok) {
      this.log('stt.error', { stage: 'scribe', error: r.error, detail: r.detail, sttMs, end: reason })
      return fail(r.error, tStartMs, tEndMs)
    }
    this.log('stt.utterance', { sttMs, audioMs: Math.round(pcm.byteLength / BYTES_PER_MS), end: reason, chars: r.text.length })
    // T-316: per-utterance loudness for the wearer/partner gap (decides T-314). Log-only; `text` lets
    // the tester label who spoke. In-memory eventLog export only — no audio leaves the device.
    this.lastLevel = { speechDb: vad.speechDb, speechMs: tEndMs - tStartMs }
    this.log('stt.level', { speechDb: vad.speechDb, peakDb: Math.round(vad.peakDb), floorDb: Math.round(vad.noiseFloorDb), speechMs: tEndMs - tStartMs, end: reason, text: r.text })
    return { text: r.text, isFinal: true, tStartMs, tEndMs }
  }

  private onChunk(pcm: Uint8Array): void {
    if (this.rolling) {
      this.rollingVad ??= new EnergyVad(this.now(), s => this.emitSpeech(s), this.o.vad)
      this.rollingVad.push(pcm)
    }
    const u = this.active
    if (!u) return
    if (!u.vad) {
      u.audioT0 = this.now()
      // While rolling, the rolling VAD already reports speech state; don't double it.
      u.vad = new EnergyVad(u.audioT0, s => { if (!this.rolling) this.emitSpeech(s) }, this.o.vad)
    }
    u.chunks.push(pcm.slice())
    u.vad.push(pcm)
    if (u.vad.heardSpeech && u.vad.silenceMs >= u.endSilenceMs) u.finish('silence')
  }

  private emitSpeech(s: SpeechState): void {
    for (const cb of [...this.speech]) cb(s)
  }

  private async acquire(): Promise<boolean> {
    if (this.closeTimer) { clearTimeout(this.closeTimer); this.closeTimer = null }
    this.micOpen ??= this.o.mic.open()
    const ok = await this.micOpen
    if (!ok) this.micOpen = null
    return ok
  }

  private release(): void {
    if (this.rolling || this.active || !this.micOpen || this.closeTimer) return
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null
      if (this.rolling || this.active || !this.micOpen) return
      this.micOpen = null
      void this.o.mic.close()
    }, this.keepWarmMs)
  }
}

const alignEven = (n: number) => Math.round(n) & ~1

function fail(error: SttErrorCode, tStartMs: number, tEndMs: number): Transcript {
  return { text: '', isFinal: true, tStartMs, tEndMs, error }
}
