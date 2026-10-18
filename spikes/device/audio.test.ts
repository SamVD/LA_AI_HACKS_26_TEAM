import { describe, expect, it } from 'vitest'
import { SAMPLE_RATE, clipStats, concatPcm, toWav } from './audio'

function tone(seconds: number, amplitude: number): Int16Array {
  const out = new Int16Array(seconds * SAMPLE_RATE)
  for (let i = 0; i < out.length; i++) out[i] = Math.round(amplitude * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE))
  return out
}

describe('S-3 audio helpers', () => {
  it('joins little-endian chunks into samples, dropping a trailing odd byte', () => {
    const samples = concatPcm([new Uint8Array([0x01, 0x00, 0xff]), new Uint8Array([0xff, 0x00])])
    expect(Array.from(samples)).toEqual([1, -1])
  })

  it('separates a quiet floor from louder speech', () => {
    const quiet = tone(1, 100)
    const loud = tone(1, 10000)
    const both = new Int16Array(quiet.length + loud.length)
    both.set(quiet); both.set(loud, quiet.length)
    const s = clipStats(both, [{ tMs: 0, bytes: 0 }, { tMs: 40, bytes: 0 }, { tMs: 200, bytes: 0 }])
    expect(s.seconds).toBe(2)
    expect(s.snrDb).toBeGreaterThan(35)
    expect(s.maxGapMs).toBe(160)
    expect(s.clippedPct).toBe(0)
  })

  it('writes a playable 16 kHz mono WAV header', () => {
    const wav = toWav(new Int16Array([1, 2, 3]))
    const v = new DataView(wav.buffer)
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF')
    expect(v.getUint32(24, true)).toBe(SAMPLE_RATE)
    expect(v.getUint32(40, true)).toBe(6)
    expect(wav.byteLength).toBe(50)
  })
})
