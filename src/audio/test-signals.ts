// Synthetic PCM for tests (no recordings are committed). Levels follow S-3's
// glasses-mic measurements: noise floor about -40 dBFS, speech about -15 dBFS.
import { SAMPLE_RATE } from './pcm'

export type Segment = { ms: number; db: number; hz?: number }

/** Deterministic noise plus tone bursts, as s16le bytes. */
export function synth(segments: Segment[], seed = 1): Uint8Array {
  const total = segments.reduce((n, s) => n + Math.round((s.ms * SAMPLE_RATE) / 1000), 0)
  const out = new Uint8Array(total * 2)
  const view = new DataView(out.buffer)
  let rnd = seed >>> 0
  const noise = () => { rnd = (rnd * 1664525 + 1013904223) >>> 0; return rnd / 2 ** 31 - 1 }
  let i = 0
  for (const s of segments) {
    const n = Math.round((s.ms * SAMPLE_RATE) / 1000)
    const amp = 32768 * 10 ** (s.db / 20)
    for (let k = 0; k < n; k++, i++) {
      // RMS of a sine is amp/sqrt(2); of uniform noise amp/sqrt(3). Scale so both hit `db`.
      const v = s.hz ? Math.SQRT2 * amp * Math.sin((2 * Math.PI * s.hz * k) / SAMPLE_RATE) : Math.sqrt(3) * amp * noise()
      view.setInt16(i * 2, Math.max(-32768, Math.min(32767, Math.round(v))), true)
    }
  }
  return out
}

/** Split into SDK-sized chunks (the glasses mic sends 50 ms). */
export function chunks(bytes: Uint8Array, ms = 50): Uint8Array[] {
  const step = Math.round((ms * SAMPLE_RATE) / 1000) * 2
  const out: Uint8Array[] = []
  for (let i = 0; i < bytes.byteLength; i += step) out.push(bytes.subarray(i, i + step))
  return out
}

export const FLOOR = -40
export const SPEECH = -15
export const quiet = (ms: number): Segment => ({ ms, db: FLOOR })
export const word = (ms: number, db = SPEECH): Segment => ({ ms, db, hz: 220 })
/** Digital zeros, as the simulator sends in the first frame after the mic opens. */
export const zeros = (ms: number): Segment => ({ ms, db: -400 })
