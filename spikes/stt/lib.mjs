// S-1 spike helpers: key loading, WAV/PCM handling, ElevenLabs batch + realtime calls.
// Node built-ins only. Never logs the API key.
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const HERE = dirname(fileURLToPath(import.meta.url))
export const REPO = join(HERE, '..', '..')
export const SAMPLE_RATE = 16000

export function loadKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim()
  const envFile = join(REPO, '.env.local')
  if (existsSync(envFile)) {
    let found = ''
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^\s*ELEVENLABS_API_KEY\s*=\s*(.*)\s*$/)
      const v = m?.[1].replace(/^['"]|['"]$/g, '').trim()
      if (v) found = v // last non-empty assignment wins
    }
    if (found) return found
  }
  throw new Error('ELEVENLABS_API_KEY not set (shell env or .env.local at repo root)')
}

export function hostBase(host = 'api.elevenlabs.io') {
  return `https://${host}`
}

// --- WAV <-> PCM ------------------------------------------------------------

/** Returns the s16le mono PCM payload of a canonical or extended WAV file. */
export function wavToPcm(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error('not a RIFF file')
  let off = 12
  let fmt = null
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const size = buf.readUInt32LE(off + 4)
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(off + 8),
        channels: buf.readUInt16LE(off + 10),
        rate: buf.readUInt32LE(off + 12),
        bits: buf.readUInt16LE(off + 22),
      }
    } else if (id === 'data') {
      if (!fmt || fmt.channels !== 1 || fmt.rate !== SAMPLE_RATE || fmt.bits !== 16) {
        throw new Error(`expected 16 kHz mono s16 WAV, got ${JSON.stringify(fmt)}`)
      }
      return buf.subarray(off + 8, off + 8 + size)
    }
    off += 8 + size + (size % 2)
  }
  throw new Error('no data chunk')
}

/** Wraps 16 kHz mono s16le PCM in a 44-byte WAV header (what api/stt would do). */
export function pcmToWav(pcm) {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0, 'ascii')
  h.writeUInt32LE(36 + pcm.length, 4)
  h.write('WAVE', 8, 'ascii')
  h.write('fmt ', 12, 'ascii')
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20) // PCM
  h.writeUInt16LE(1, 22) // mono
  h.writeUInt32LE(SAMPLE_RATE, 24)
  h.writeUInt32LE(SAMPLE_RATE * 2, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36, 'ascii')
  h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}

export function durationMs(pcm) {
  return Math.round((pcm.length / 2 / SAMPLE_RATE) * 1000)
}

// --- Batch: POST /v1/speech-to-text -----------------------------------------

/**
 * One batch call. `format` is 'wav' (WAV container, file_format=other) or
 * 'pcm' (raw s16le, file_format=pcm_s16le_16). `keytermsMode` picks how the
 * keyterms list is encoded in multipart: 'repeat' (one field per term) or 'json'.
 */
export async function batchTranscribe(pcm, opts = {}) {
  const {
    key,
    token,
    host = 'api.elevenlabs.io',
    format = 'pcm',
    model = 'scribe_v2',
    language = 'en',
    keyterms = [],
    keytermsMode = 'repeat',
    extra = {},
  } = opts
  const fd = new FormData()
  fd.append('model_id', model)
  if (language) fd.append('language_code', language)
  if (format === 'pcm') {
    fd.append('file_format', 'pcm_s16le_16')
    fd.append('file', new Blob([pcm], { type: 'application/octet-stream' }), 'clip.pcm')
  } else {
    fd.append('file', new Blob([pcmToWav(pcm)], { type: 'audio/wav' }), 'clip.wav')
  }
  if (keyterms.length) {
    if (keytermsMode === 'json') fd.append('keyterms', JSON.stringify(keyterms))
    else for (const k of keyterms) fd.append('keyterms', k)
  }
  for (const [k, v] of Object.entries(extra)) fd.append(k, String(v))

  const url = new URL(`${hostBase(host)}/v1/speech-to-text`)
  if (token) url.searchParams.set('token', token)
  const headers = key ? { 'xi-api-key': key } : {}
  const t0 = performance.now()
  const res = await fetch(url, { method: 'POST', headers, body: fd })
  const body = await res.text()
  const ms = performance.now() - t0
  let json = null
  try {
    json = JSON.parse(body)
  } catch {}
  return {
    ok: res.ok,
    status: res.status,
    ms,
    text: json?.text ?? null,
    words: json?.words?.filter((w) => w.type !== 'spacing').map((w) => ({ t: w.text, type: w.type, lp: w.logprob })) ?? null,
    language: json?.language_code ?? null,
    error: res.ok ? null : body.slice(0, 400),
    acao: res.headers.get('access-control-allow-origin'),
  }
}

// --- Single-use token --------------------------------------------------------

export async function mintToken(key, type, host = 'api.elevenlabs.io') {
  const t0 = performance.now()
  const res = await fetch(`${hostBase(host)}/v1/single-use-token/${type}`, {
    method: 'POST',
    headers: { 'xi-api-key': key },
  })
  const body = await res.json().catch(() => ({}))
  const ms = performance.now() - t0
  if (!res.ok || !body.token) throw new Error(`token ${type} failed ${res.status}: ${JSON.stringify(body).slice(0, 300)}`)
  return { token: body.token, ms }
}

// --- Realtime: wss /v1/speech-to-text/realtime --------------------------------

/**
 * Streams `pcm` at real-time pace in `chunkMs` chunks, then (manual) commits on
 * the last chunk or (vad) appends `trailSilenceMs` of silence and waits for the
 * server to commit. Resolves with timings relative to stream events.
 */
export function realtimeTranscribe(pcm, opts) {
  const {
    token,
    host = 'api.elevenlabs.io',
    chunkMs = 100,
    commitStrategy = 'manual',
    language = 'en',
    keyterms = [],
    vadSilenceSecs,
    trailSilenceMs = 0,
    pace = 1, // 1 = real time, 0 = as fast as possible
    timeoutMs = 15000,
  } = opts
  const qs = new URLSearchParams({
    model_id: 'scribe_v2_realtime',
    token,
    audio_format: 'pcm_16000',
    commit_strategy: commitStrategy,
  })
  if (language) qs.set('language_code', language)
  if (vadSilenceSecs != null) qs.set('vad_silence_threshold_secs', String(vadSilenceSecs))
  for (const k of keyterms) qs.append('keyterms', k)
  const url = `wss://${host}/v1/speech-to-text/realtime?${qs}`

  return new Promise((resolve) => {
    const out = { ok: false, partials: [], committed: [], events: [], error: null }
    const t0 = performance.now()
    const at = () => Math.round(performance.now() - t0)
    let tStreamStart = null
    let tSpeechEnd = null // when the last speech byte was sent
    let done = false
    const ws = new WebSocket(url)
    const finish = (why) => {
      if (done) return
      done = true
      out.why = why
      try {
        ws.close()
      } catch {}
      resolve(out)
    }
    const timer = setTimeout(() => finish('timeout'), timeoutMs)

    ws.onopen = () => (out.tOpen = at())
    ws.onerror = (e) => {
      out.error = out.error ?? `ws error: ${e?.message ?? 'unknown'}`
      clearTimeout(timer)
      finish('error')
    }
    ws.onclose = (e) => {
      out.close = { code: e.code, reason: e.reason }
      clearTimeout(timer)
      finish('closed')
    }
    ws.onmessage = async (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : await ev.data.text())
      const t = at()
      out.events.push({ t, type: msg.message_type, text: msg.text })
      if (msg.message_type === 'session_started') {
        out.tSession = t
        out.config = msg.config
        stream()
      } else if (msg.message_type === 'partial_transcript') {
        if (msg.text && out.tFirstPartial == null) out.tFirstPartial = t - tStreamStart
        out.partials.push(msg.text)
      } else if (msg.message_type === 'committed_transcript') {
        out.committed.push(msg.text)
        if (out.tCommit == null) out.tCommit = t - tSpeechEnd
        out.text = out.committed.join(' ').trim()
        out.ok = true
        clearTimeout(timer)
        finish('committed')
      } else if (msg.error || /error|exceeded|throttled|limited|overflow|exhausted|invalid/.test(msg.message_type)) {
        out.error = `${msg.message_type}: ${msg.error ?? JSON.stringify(msg)}`
        clearTimeout(timer)
        finish('server-error')
      }
    }

    const bytesPerChunk = Math.round((SAMPLE_RATE * 2 * chunkMs) / 1000)
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    async function stream() {
      tStreamStart = at()
      const silence = Buffer.alloc(Math.round((SAMPLE_RATE * 2 * trailSilenceMs) / 1000))
      const all = Buffer.concat([pcm, silence])
      for (let off = 0; off < all.length && !done; off += bytesPerChunk) {
        const chunk = all.subarray(off, off + bytesPerChunk)
        const last = off + bytesPerChunk >= all.length
        if (off + bytesPerChunk >= pcm.length && tSpeechEnd == null) tSpeechEnd = at()
        ws.send(
          JSON.stringify({
            message_type: 'input_audio_chunk',
            audio_base_64: chunk.toString('base64'),
            commit: commitStrategy === 'manual' && last,
            sample_rate: SAMPLE_RATE,
          }),
        )
        if (pace > 0 && !last) await sleep(chunkMs * pace)
      }
      if (tSpeechEnd == null) tSpeechEnd = at()
      out.tSpeechEnd = tSpeechEnd
    }
  })
}

/**
 * Rolling use (Steps 2-3): stream a long clip at real-time pace with VAD
 * commits and word timestamps, keep the socket open `tailMs` after the audio,
 * and record every message with its arrival time since stream start. Since
 * audio is sent in real time, arrival time minus a word's `end` timestamp is
 * the lag between the user saying the word and the app seeing it.
 */
export function realtimeRolling(pcm, opts) {
  const { token, host = 'api.elevenlabs.io', chunkMs = 100, vadSilenceSecs = 0.5, keyterms = [], tailMs = 3000, language = 'en' } = opts
  const qs = new URLSearchParams({
    model_id: 'scribe_v2_realtime',
    token,
    audio_format: 'pcm_16000',
    commit_strategy: 'vad',
    vad_silence_threshold_secs: String(vadSilenceSecs),
    include_timestamps: 'true',
  })
  if (language) qs.set('language_code', language)
  for (const k of keyterms) qs.append('keyterms', k)
  return new Promise((resolve) => {
    const out = { events: [], error: null }
    let tStream = null
    const at = () => Math.round(performance.now() - (tStream ?? performance.now()))
    const ws = new WebSocket(`wss://${host}/v1/speech-to-text/realtime?${qs}`)
    let done = false
    const finish = (why) => {
      if (done) return
      done = true
      out.why = why
      try {
        ws.close()
      } catch {}
      resolve(out)
    }
    ws.onerror = () => finish('error')
    ws.onclose = (e) => ((out.close = { code: e.code, reason: e.reason }), finish('closed'))
    ws.onmessage = async (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : await ev.data.text())
      if (msg.message_type === 'session_started') return stream()
      out.events.push({ t: at(), type: msg.message_type, text: msg.text, words: msg.words?.filter((w) => w.type === 'word').map((w) => ({ t: w.text, s: w.start, e: w.end })) })
      if (msg.error) out.error = `${msg.message_type}: ${msg.error}`
    }
    const bytesPerChunk = Math.round((SAMPLE_RATE * 2 * chunkMs) / 1000)
    async function stream() {
      tStream = performance.now()
      for (let off = 0; off < pcm.length && !done; off += bytesPerChunk) {
        ws.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: pcm.subarray(off, off + bytesPerChunk).toString('base64'), commit: false, sample_rate: SAMPLE_RATE }))
        await new Promise((r) => setTimeout(r, chunkMs))
      }
      // keep sending silence (like a live mic) so VAD can close the last segment
      const silence = Buffer.alloc(bytesPerChunk)
      const end = performance.now() + tailMs
      while (!done && performance.now() < end) {
        ws.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: silence.toString('base64'), commit: false, sample_rate: SAMPLE_RATE }))
        await new Promise((r) => setTimeout(r, chunkMs))
      }
      finish('done')
    }
  })
}

// --- stats --------------------------------------------------------------------

export function pct(xs, p) {
  const s = [...xs].sort((a, b) => a - b)
  if (!s.length) return NaN
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))
  return s[i]
}

export function summary(xs) {
  return { n: xs.length, p50: Math.round(pct(xs, 50)), p95: Math.round(pct(xs, 95)), min: Math.round(Math.min(...xs)), max: Math.round(Math.max(...xs)) }
}
