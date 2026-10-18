// S-1 spike: ElevenLabs Scribe from a browser WebView.
//
// Measures, against the live API:
//   1. single-use token minting (batch_scribe, realtime_scribe)
//   2. CORS on the batch endpoint and token endpoint (as a WebView origin would see it)
//   3. batch latency for 1-3 s single-word clips, raw PCM vs WAV, with and without keyterms
//   4. realtime (WebSocket) latency from final audio chunk to committed transcript
//   5. behaviour on partial / mispronounced words ("cop" for cup) and whether keyterms bias it
//
// Test clips are synthesised with ElevenLabs TTS (pcm_16000), the same format the G2
// delivers (16 kHz mono s16le). They live in spikes/stt/.out/ which is gitignored.
// Your own recordings: pass --clip path/to/file.wav (16 kHz mono 16-bit) one or more times.
//
// Usage:  ELEVENLABS_API_KEY=... node spikes/stt/bench-tts.mjs [--reps 3] [--clip a.wav ...] [--skip-realtime]
// Node >= 22 (global fetch + WebSocket).

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '.out')
const API = 'https://api.elevenlabs.io'
const WSS = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime'
const ORIGIN = 'http://localhost:5173' // what the Vite dev server / WebView page sends
const VOICE = process.env.ELEVENLABS_VOICE_ID ?? 'JBFqnCBsd6RMkjVDRZzb'
const KEY = process.env.ELEVENLABS_API_KEY

const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const REPS = Number(opt('--reps', 3))
const userClips = args.flatMap((a, i) => (a === '--clip' ? [args[i + 1]] : []))

if (!KEY) {
  console.error('Set ELEVENLABS_API_KEY (never commit it).')
  process.exit(1)
}

// spoken text -> target word the user was trying to say
const CASES = [
  { id: 'cup', say: 'cup', target: 'cup', note: 'clean' },
  { id: 'cop', say: 'cop', target: 'cup', note: 'vowel error' },
  { id: 'tup', say: 'tup', target: 'cup', note: 'onset error' },
  { id: 'cuh', say: 'cuh', target: 'cup', note: 'truncated' },
  { id: 'c-c-cup', say: 'c... c... cup', target: 'cup', note: 'stutter onset' },
  { id: 'um-cup', say: 'um... cup', target: 'cup', note: 'filler' },
  { id: 'spoo', say: 'spoo', target: 'spoon', note: 'truncated' },
  { id: 'toofbrush', say: 'toofbrush', target: 'toothbrush', note: 'phoneme sub' },
  { id: 'metformin', say: 'metformin', target: 'metformin', note: 'medication' },
  { id: 'metforman', say: 'met for man', target: 'metformin', note: 'medication, mangled' },
  { id: 'maya', say: 'Maya', target: 'Maya', note: 'name' },
  { id: 'sentence', say: 'I want a cup of, um, coffee', target: 'coffee', note: 'rolling-style phrase' },
]

const pcmToWav = (pcm, rate = 16000) => {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8)
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22)
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34)
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}
const wavToPcm = (wav) => {
  // find the "data" chunk; assumes 16 kHz mono s16le
  let i = 12
  while (i < wav.length - 8) {
    const id = wav.toString('ascii', i, i + 4), len = wav.readUInt32LE(i + 4)
    if (id === 'data') return wav.subarray(i + 8, i + 8 + len)
    i += 8 + len
  }
  throw new Error('no data chunk')
}
const silence = (ms) => Buffer.alloc(Math.round(16 * ms) * 2)
const durMs = (pcm) => Math.round(pcm.length / 32)
const ms = (t0) => Math.round(performance.now() - t0)
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }

async function timed(fn) { const t0 = performance.now(); const r = await fn(); return [r, ms(t0)] }

async function mintToken(type) {
  const [res, t] = await timed(() => fetch(`${API}/v1/single-use-token/${type}`, { method: 'POST', headers: { 'xi-api-key': KEY } }))
  const body = await res.json().catch(() => ({}))
  return { type, status: res.status, ms: t, token: body.token, error: res.ok ? undefined : body }
}

async function corsProbe() {
  const probes = []
  const pick = (h) => Object.fromEntries(['access-control-allow-origin', 'access-control-allow-headers', 'access-control-allow-methods', 'access-control-allow-credentials'].map((k) => [k, h.get(k)]))
  for (const [label, url, reqHeaders] of [
    ['preflight batch STT with xi-api-key header', `${API}/v1/speech-to-text`, 'xi-api-key'],
    ['preflight batch STT, token in query (no custom header)', `${API}/v1/speech-to-text?token=x`, ''],
    ['preflight token mint (would expose key; check only)', `${API}/v1/single-use-token/batch_scribe`, 'xi-api-key'],
  ]) {
    const headers = { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' }
    if (reqHeaders) headers['Access-Control-Request-Headers'] = reqHeaders
    const res = await fetch(url, { method: 'OPTIONS', headers })
    probes.push({ label, status: res.status, ...pick(res.headers) })
  }
  return probes
}

async function tts(text) {
  const res = await fetch(`${API}/v1/text-to-speech/${VOICE}?output_format=pcm_16000`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }),
  })
  if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`)
  return Buffer.from(await res.arrayBuffer())
}

async function loadClips() {
  await mkdir(OUT, { recursive: true })
  const clips = []
  for (const c of CASES) {
    const f = join(OUT, `${c.id}.pcm`)
    let pcm
    if (existsSync(f)) pcm = await readFile(f)
    else { pcm = Buffer.concat([silence(300), await tts(c.say), silence(400)]); await writeFile(f, pcm) }
    clips.push({ ...c, pcm, durMs: durMs(pcm), synthetic: true })
  }
  for (const p of userClips) {
    const pcm = wavToPcm(await readFile(p))
    // filename convention: <spoken>__<target>.wav, e.g. cop__cup.wav
    const [say, target = say] = basename(p, '.wav').split('__')
    clips.push({ id: basename(p), say, target, note: 'recorded', pcm, durMs: durMs(pcm), synthetic: false })
  }
  return clips
}

// --- batch -----------------------------------------------------------------

async function batch(clip, { format, keyterms, useToken }) {
  const fd = new FormData()
  fd.append('model_id', 'scribe_v2')
  fd.append('language_code', 'en')
  fd.append('tag_audio_events', 'false')
  if (format === 'pcm') {
    fd.append('file_format', 'pcm_s16le_16')
    fd.append('file', new Blob([clip.pcm]), 'clip.pcm')
  } else {
    fd.append('file', new Blob([pcmToWav(clip.pcm)], { type: 'audio/wav' }), 'clip.wav')
  }
  if (keyterms) for (const k of keyterms) fd.append('keyterms', k)

  let url = `${API}/v1/speech-to-text`
  const headers = { Origin: ORIGIN }
  if (useToken) {
    const t = await mintToken('batch_scribe')
    if (!t.token) return { error: `token mint failed ${t.status}` }
    url += `?token=${encodeURIComponent(t.token)}`
  } else headers['xi-api-key'] = KEY

  const [res, t] = await timed(() => fetch(url, { method: 'POST', headers, body: fd }))
  const body = await res.json().catch(() => ({}))
  return {
    status: res.status, ms: t, text: body.text ?? '', acao: res.headers.get('access-control-allow-origin'),
    words: (body.words ?? []).filter((w) => w.type === 'word').map((w) => ({ t: w.text, lp: w.logprob })),
    error: res.ok ? undefined : JSON.stringify(body).slice(0, 300),
  }
}

// --- realtime --------------------------------------------------------------

async function realtime(clip, { keyterms, pace = 1 } = {}) {
  const tok = await mintToken('realtime_scribe')
  if (!tok.token) return { error: `token mint failed ${tok.status}` }
  const q = new URLSearchParams({ model_id: 'scribe_v2_realtime', token: tok.token, audio_format: 'pcm_16000', commit_strategy: 'manual', language_code: 'en' })
  for (const k of keyterms ?? []) q.append('keyterms', k)

  return new Promise((resolve) => {
    const t0 = performance.now()
    const r = { connectMs: 0, firstPartialMs: null, commitLatencyMs: null, partials: [], text: '', events: [] }
    let tLastChunk = 0
    const ws = new WebSocket(`${WSS}?${q}`)
    const done = (extra = {}) => { clearTimeout(timer); try { ws.close() } catch {} ; resolve({ ...r, ...extra }) }
    const timer = setTimeout(() => done({ error: 'timeout 15s' }), 15000)

    ws.onerror = (e) => done({ error: `ws error ${e.message ?? ''}` })
    ws.onmessage = async (ev) => {
      const m = JSON.parse(ev.data)
      r.events.push(m.message_type)
      if (m.message_type === 'session_started') {
        r.connectMs = ms(t0)
        // stream in 100 ms chunks at `pace` x real time, commit on the last one
        const CH = 3200
        for (let i = 0; i < clip.pcm.length; i += CH) {
          const last = i + CH >= clip.pcm.length
          ws.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: clip.pcm.subarray(i, i + CH).toString('base64'), commit: last, sample_rate: 16000 }))
          if (last) tLastChunk = performance.now()
          else await new Promise((s) => setTimeout(s, 100 / pace))
        }
      } else if (m.message_type === 'partial_transcript') {
        if (r.firstPartialMs === null) r.firstPartialMs = ms(t0) - r.connectMs
        r.partials.push(m.text)
      } else if (m.message_type === 'committed_transcript') {
        r.text = m.text
        r.commitLatencyMs = tLastChunk ? ms(tLastChunk) : null
        done()
      } else if (/error|exceeded|throttled|limited|invalid|unaccepted/.test(m.message_type)) {
        done({ error: `${m.message_type}: ${m.error ?? m.message ?? ''}` })
      }
    }
  })
}

// --- main ------------------------------------------------------------------

const norm = (s) => s.toLowerCase().replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim()
const hit = (text, target) => norm(text).split(' ').includes(norm(target))

if (flag('--tokens')) {
  // fresh single-use tokens for browser-check.html (each expires in 15 min, consumed on use)
  for (const t of ['batch_scribe', 'realtime_scribe']) console.log(t, (await mintToken(t)).token)
  process.exit(0)
}

const results = { at: new Date().toISOString(), voice: VOICE, reps: REPS }

console.log('1) tokens')
results.tokens = [await mintToken('batch_scribe'), await mintToken('realtime_scribe')].map(({ token, ...t }) => ({ ...t, gotToken: !!token }))
console.table(results.tokens)

console.log('2) CORS')
results.cors = await corsProbe()
console.table(results.cors)

console.log('3) clips')
const clips = await loadClips()
console.table(clips.map(({ pcm, ...c }) => c))

console.log('4) batch')
const VARIANTS = [
  { name: 'pcm', format: 'pcm' },
  { name: 'wav', format: 'wav' },
  { name: 'pcm+keyterm', format: 'pcm', kt: true },
  { name: 'pcm+token', format: 'pcm', useToken: true },
]
results.batch = []
for (const c of clips) {
  for (const v of VARIANTS) {
    const runs = []
    for (let i = 0; i < REPS; i++) runs.push(await batch(c, { format: v.format, keyterms: v.kt ? [c.target] : undefined, useToken: v.useToken }))
    const ok = runs.filter((x) => !x.error)
    const row = {
      clip: c.id, said: c.say, target: c.target, variant: v.name, durMs: c.durMs,
      p50: ok.length ? pct(ok.map((x) => x.ms), 0.5) : null, max: ok.length ? Math.max(...ok.map((x) => x.ms)) : null,
      text: ok[0]?.text ?? '', targetHeard: ok.length ? hit(ok[0].text, c.target) : false,
      acao: ok[0]?.acao ?? null, error: runs.find((x) => x.error)?.error,
    }
    results.batch.push(row)
    console.log(JSON.stringify(row))
  }
}

if (!flag('--skip-realtime')) {
  console.log('5) realtime')
  results.realtime = []
  for (const c of clips) {
    for (const kt of [false, true]) {
      const r = await realtime(c, { keyterms: kt ? [c.target] : undefined })
      const row = { clip: c.id, said: c.say, target: c.target, keyterm: kt, connectMs: r.connectMs, firstPartialMs: r.firstPartialMs, commitLatencyMs: r.commitLatencyMs, text: r.text, targetHeard: hit(r.text, c.target), partials: r.partials.length, error: r.error }
      results.realtime.push(row)
      console.log(JSON.stringify(row))
    }
  }
}

// summary
const lat = (variant) => results.batch.filter((r) => r.variant === variant && r.p50 != null && r.durMs <= 3000).map((r) => r.p50)
results.summary = Object.fromEntries(VARIANTS.map((v) => [v.name, { p50: pct(lat(v.name), 0.5), p95: pct(lat(v.name), 0.95), n: lat(v.name).length }]))
if (results.realtime) {
  const rl = results.realtime.filter((r) => r.commitLatencyMs != null).map((r) => r.commitLatencyMs)
  results.summary.realtimeCommit = { p50: pct(rl, 0.5), p95: pct(rl, 0.95), n: rl.length }
}
console.log('summary'); console.table(results.summary)

await writeFile(join(HERE, 'results.json'), JSON.stringify(results, null, 2))
console.log(`wrote ${join(HERE, 'results.json')}`)
