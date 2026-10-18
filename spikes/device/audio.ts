// Pure helpers for the S-3 mic comparison. No SDK imports, so they run in Vitest.
// Audio from both G2 sources is PCM s16le, 16 kHz, mono.

export const SAMPLE_RATE = 16000
const WINDOW = SAMPLE_RATE / 10 // 100 ms windows

export interface Chunk { tMs: number; bytes: number }

export interface ClipStats {
  seconds: number
  chunks: number
  // Level of each 100 ms window in dBFS; floor = 10th percentile, speech = 90th.
  floorDb: number
  speechDb: number
  snrDb: number
  clippedPct: number
  // Largest gap between consecutive chunks, i.e. dropouts on the BLE / bridge path.
  maxGapMs: number
}

export function concatPcm(parts: Uint8Array[]): Int16Array {
  const total = parts.reduce((n, p) => n + p.byteLength, 0)
  const bytes = new Uint8Array(total - (total % 2))
  let offset = 0
  for (const p of parts) {
    bytes.set(p.subarray(0, Math.min(p.byteLength, bytes.byteLength - offset)), offset)
    offset += p.byteLength
    if (offset >= bytes.byteLength) break
  }
  return new Int16Array(bytes.buffer, 0, bytes.byteLength / 2)
}

const dbfs = (rms: number) => (rms <= 0 ? -120 : 20 * Math.log10(rms / 32768))

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return -120
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
}

export function clipStats(samples: Int16Array, chunks: Chunk[]): ClipStats {
  const levels: number[] = []
  let clipped = 0
  for (let start = 0; start + WINDOW <= samples.length; start += WINDOW) {
    let sum = 0
    for (let i = start; i < start + WINDOW; i++) {
      const s = samples[i]
      sum += s * s
      if (s >= 32767 || s <= -32768) clipped++
    }
    levels.push(dbfs(Math.sqrt(sum / WINDOW)))
  }
  levels.sort((a, b) => a - b)
  let maxGapMs = 0
  for (let i = 1; i < chunks.length; i++) maxGapMs = Math.max(maxGapMs, chunks[i].tMs - chunks[i - 1].tMs)
  const floorDb = percentile(levels, 0.1)
  const speechDb = percentile(levels, 0.9)
  return {
    seconds: samples.length / SAMPLE_RATE,
    chunks: chunks.length,
    floorDb,
    speechDb,
    snrDb: speechDb - floorDb,
    clippedPct: samples.length ? (100 * clipped) / samples.length : 0,
    maxGapMs,
  }
}

// 44-byte RIFF header + PCM, so the phone page can play the clip back.
export function toWav(samples: Int16Array): Uint8Array {
  const dataBytes = samples.length * 2
  const out = new Uint8Array(44 + dataBytes)
  const v = new DataView(out.buffer)
  const ascii = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i) }
  ascii(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true); ascii(8, 'WAVE')
  ascii(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, SAMPLE_RATE, true); v.setUint32(28, SAMPLE_RATE * 2, true)
  v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  ascii(36, 'data'); v.setUint32(40, dataBytes, true)
  out.set(new Uint8Array(samples.buffer, samples.byteOffset, dataBytes), 44)
  return out
}

export function formatStats(label: string, s: ClipStats): string {
  return `${label}: ${s.seconds.toFixed(1)}s, ${s.chunks} chunks, floor ${s.floorDb.toFixed(0)} dB, ` +
    `speech ${s.speechDb.toFixed(0)} dB, SNR ${s.snrDb.toFixed(0)} dB, clip ${s.clippedPct.toFixed(2)}%, ` +
    `max gap ${s.maxGapMs} ms`
}
