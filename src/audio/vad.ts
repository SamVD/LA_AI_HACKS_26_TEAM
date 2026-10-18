import type { SpeechState } from '../core/types'
import { SAMPLE_RATE, levelDb, toSamples } from './pcm'

// Energy VAD over 20 ms frames with an adaptive noise floor.
//
// The floor is the minimum frame level over the last `floorWindowMs`, tracked at
// all times (minimum statistics). Two failure modes this avoids, both seen in the
// simulator: (1) the first frame after audioControl(true) is digital silence, so a
// floor seeded from it sits at -120 dB and room tone looks like speech; (2) a floor
// frozen while "speaking" can never recover from a false onset. Digital-silence
// frames never feed the floor, and the first `warmupMs` never count as speech.
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
  /** Noise floor = quietest frame in this trailing window. Also bounds how long a false onset can last. */
  floorWindowMs?: number
  /** Frames at the start that only seed the floor. */
  warmupMs?: number
}

/** Below this a frame is digital silence (a stream artifact), not room tone. */
const DIGITAL_SILENCE_DB = -100

const FRAME = SAMPLE_RATE / 50 // 20 ms
const FRAME_MS = 20

export class EnergyVad {
  private readonly marginDb: number
  private readonly minSpeechDb: number
  private readonly onsetFrames: number
  private readonly hangFrames: number
  private carry = new Int16Array(0)
  private frames = 0
  private readonly floorFrames: number
  private readonly warmupFrames: number
  private readonly history: number[] = [] // recent non-digital-silence frame levels
  private peak = -120 // loudest frame so far (diagnostics)
  private run = 0 // consecutive speech frames
  private quiet = 0 // consecutive non-speech frames while speaking
  private speaking = false
  private firstSpeechFrame = -1
  private lastSpeechFrame = -1
  private runLevels: number[] = [] // levels in the current speech run, until the burst is confirmed
  private speechPower = 0 // Σ linear power of frames inside confirmed speech (T-316)
  private speechFrames = 0

  constructor(private readonly t0Ms: number, private readonly emit: (s: SpeechState) => void = () => {}, o: VadOptions = {}) {
    this.marginDb = o.marginDb ?? 12
    this.minSpeechDb = o.minSpeechDb ?? -50
    this.onsetFrames = Math.max(1, Math.round((o.onsetMs ?? 100) / FRAME_MS))
    this.hangFrames = Math.max(1, Math.round((o.hangMs ?? 300) / FRAME_MS))
    this.floorFrames = Math.max(1, Math.round((o.floorWindowMs ?? 3000) / FRAME_MS))
    this.warmupFrames = Math.round((o.warmupMs ?? 200) / FRAME_MS)
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
    if (db > this.peak) this.peak = db
    if (db > DIGITAL_SILENCE_DB) {
      this.history.push(db)
      if (this.history.length > this.floorFrames) this.history.shift()
    }
    const floor = this.floorDb
    const isSpeech = idx >= this.warmupFrames && floor !== null && db > Math.max(floor + this.marginDb, this.minSpeechDb)

    if (isSpeech) {
      this.run++
      this.quiet = 0
      this.lastSpeechFrame = idx
      if (this.speaking) {
        this.addSpeechLevel(db)
      } else {
        this.runLevels.push(db)
        if (this.run >= this.onsetFrames) {
          this.speaking = true
          const start = idx - this.run + 1
          if (this.firstSpeechFrame < 0) this.firstSpeechFrame = start
          for (const l of this.runLevels) this.addSpeechLevel(l)
          this.runLevels = []
          this.emit({ speaking: true, tMs: this.frameTime(start) })
        }
      }
    } else {
      this.run = 0
      this.runLevels = []
      if (this.speaking && ++this.quiet >= this.hangFrames) {
        this.speaking = false
        this.emit({ speaking: false, tMs: this.frameTime(this.lastSpeechFrame + 1) })
      }
    }
  }

  private frameTime(frame: number): number {
    return this.t0Ms + frame * FRAME_MS
  }

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
  /** Current noise floor and loudest frame, in dBFS: what to report when nothing counted as speech. */
  get noiseFloorDb(): number { return this.floorDb ?? -120 }
  get peakDb(): number { return this.peak }
  /** Power-averaged level (dBFS) of the frames inside confirmed speech (T-316), rounded; -120 when there was none. */
  get speechDb(): number {
    if (!this.speechFrames) return -120
    return Math.round(10 * Math.log10(this.speechPower / this.speechFrames))
  }

  private addSpeechLevel(db: number): void {
    this.speechPower += 10 ** (db / 10)
    this.speechFrames++
  }

  private get floorDb(): number | null {
    if (!this.history.length) return null
    let m = Infinity
    for (const v of this.history) if (v < m) m = v
    return m
  }
}
