// PCM helpers. Both G2 mic sources deliver signed 16-bit little-endian mono at 16 kHz.

export const SAMPLE_RATE = 16000
export const BYTES_PER_MS = (SAMPLE_RATE * 2) / 1000 // 32

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.byteLength
  }
  return out
}

/** Little-endian s16 samples from raw bytes. A trailing odd byte is ignored. */
export function toSamples(bytes: Uint8Array): Int16Array {
  const n = bytes.byteLength >> 1
  const out = new Int16Array(n)
  const view = new DataView(bytes.buffer, bytes.byteOffset, n * 2)
  for (let i = 0; i < n; i++) out[i] = view.getInt16(i * 2, true)
  return out
}

/** RMS level of a sample window in dBFS (-120 for digital silence). */
export function levelDb(samples: Int16Array, start = 0, end = samples.length): number {
  if (end <= start) return -120
  let sum = 0
  for (let i = start; i < end; i++) sum += samples[i] * samples[i]
  const rms = Math.sqrt(sum / (end - start))
  return rms <= 0 ? -120 : 20 * Math.log10(rms / 32768)
}
