import type { SpeechState } from '../core/types'
import { SAMPLE_RATE, levelDb, toSamples } from './pcm'

// Energy VAD over 20 ms frames with an adaptive noise floor.
//
// Time comes from the sample count, not from when chunks arrive, so BLE jitter
// (S-3: ~50 ms chunks, gaps up to ~95 ms) does not move speech boundaries.
// Starting thresholds come from S-3 (glasses mic floor -38 to -42 dBFS, speech
// -11 to -21 dBFS at 1 m); they are tunable, not fixed.

export interface VadOptions {
  /** Speech needs this many dB above the noise floor. */
  marginDb?: number
  /** ...and at least this absolute level, so a near-silent room never counts. */
  minSpeechDb?: number
  /** Consecutive speech this long before `speaking` turns true (rejects clicks). */
  onsetMs?: number
  /** Non-speech this long before `speaking` turns false. */
  hangMs?: number
}

const FRAME = SAMPLE_RATE / 50 // 20 ms
const FRAME_MS = 20

export class EnergyVad {
  private readonly marginDb: number
  private readonly minSpeechDb: number
  private readonly onsetFrames: number
  private readonly hangFrames: number
  private carry = new Int16Array(0)
  private frames = 0
  private floorDb: number | null = null
  private run = 0 // consecutive speech frames
  private quiet = 0 // consecutive non-speech frames while speaking
  private speaking = false
  private firstSpeechFrame = -1
  private lastSpeechFrame = -1

  constructor(private readonly t0Ms: number, private readonly emit: (s: SpeechState) => void = () => {}, o: VadOptions = {}) {
    this.marginDb = o.marginDb ?? 12
    this.minSpeechDb = o.minSpeechDb ?? -50
    this.onsetFrames = Math.max(1, Math.round((o.onsetMs ?? 100) / FRAME_MS))
    this.hangFrames = Math.max(1, Math.round((o.hangMs ?? 300) / FRAME_MS))
  }

  push(bytes: Uint8Array): void {
    const fresh = toSamples(bytes)
    const samples = new Int16Array(this.carry.length + fresh.length)
    samples.set(this.carry)
    samples.set(fresh, this.carry.length)
    let i = 0
    for (; i + FRAME <= samples.length; i += FRAME) this.frame(levelDb(samples, i, i + FRAME))
    this.carry = samples.slice(i)
  }

  private frame(db: number): void {
    const idx = this.frames++
    if (this.floorDb === null) this.floorDb = db
    const isSpeech = db > Math.max(this.floorDb + this.marginDb, this.minSpeechDb)

    if (isSpeech) {
      this.run++
      this.quiet = 0
      this.lastSpeechFrame = idx
      if (!this.speaking && this.run >= this.onsetFrames) {
        this.speaking = true
        const start = idx - this.run + 1
        if (this.firstSpeechFrame < 0) this.firstSpeechFrame = start
        this.emit({ speaking: true, tMs: this.frameTime(start) })
      }
    } else {
      this.run = 0
      // Track the floor only outside speech: drop fast, rise slowly.
      if (!this.speaking) this.floorDb += (db - this.floorDb) * (db < this.floorDb ? 0.5 : 0.02)
      if (this.speaking && ++this.quiet >= this.hangFrames) {
        this.speaking = false
        this.emit({ speaking: false, tMs: this.frameTime(this.lastSpeechFrame + 1) })
      }
    }
  }

  private frameTime(frame: number): number {
    return this.t0Ms + frame * FRAME_MS
  }

  get isSpeaking(): boolean { return this.speaking }
  /** True once speech has been confirmed at least once. */
  get heardSpeech(): boolean { return this.firstSpeechFrame >= 0 }
  /** Audio time processed so far, in ms since t0. */
  get elapsedMs(): number { return this.frames * FRAME_MS }
  /** ms since t0 where confirmed speech first started, or -1. */
  get speechStartMs(): number { return this.firstSpeechFrame < 0 ? -1 : this.firstSpeechFrame * FRAME_MS }
  /** ms since t0 at the end of the last speech frame, or -1. */
  get speechEndMs(): number { return this.lastSpeechFrame < 0 ? -1 : (this.lastSpeechFrame + 1) * FRAME_MS }
  /** Audio silence since the last speech frame (0 while speech is ongoing). */
  get silenceMs(): number { return this.lastSpeechFrame < 0 ? this.elapsedMs : this.elapsedMs - this.speechEndMs }
  get noiseFloorDb(): number { return this.floorDb ?? -120 }
}
