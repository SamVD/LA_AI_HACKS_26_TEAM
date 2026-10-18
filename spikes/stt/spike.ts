// S-1 browser harness. Served by the repo's Vite dev server at
// /spikes/stt/index.html. Tokens come from spikes/stt/token-server.mjs; the API
// key never reaches this page. Not imported by src/.
const API = 'https://api.elevenlabs.io'
const WSS = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime'
const RATE = 16000
// ?tokenUrl=https://<host>/api/stt overrides the dev token server (needed in a
// packaged .ehpk, whose origin is not the laptop).
const TOKEN_URL = new URLSearchParams(location.search).get('tokenUrl') ?? `${location.protocol}//${location.hostname}:8787`

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const logEl = $('log')
const results: unknown[] = []
;(window as any).sttResults = results

function log(msg: string, cls = '') {
  const line = document.createElement('div')
  line.textContent = `${new Date().toISOString().slice(11, 23)} ${msg}`
  if (cls) line.className = cls
  logEl.prepend(line)
  console.log('[stt-spike]', msg)
}

$('origin').textContent = location.origin
$('tokenUrl').textContent = TOKEN_URL

type Clip = { id: string; say: string; target: string; kind: string; ms: number }
let clips: Clip[] = []

async function loadClips() {
  try {
    clips = await (await fetch('./clips/manifest.json')).json()
    const sel = $<HTMLSelectElement>('clip')
    for (const c of clips) sel.add(new Option(`${c.id} (${c.kind}, said "${c.say}", target ${c.target})`, c.id))
  } catch (e) {
    log(`no clips: run node spikes/stt/make-clips.mjs (${e})`, 'err')
  }
}

async function clipPcm(id: string): Promise<Uint8Array> {
  const buf = new Uint8Array(await (await fetch(`./clips/${id}.wav`)).arrayBuffer())
  return buf.subarray(44) // make-clips writes a canonical 44-byte header
}

function keyterms(): string[] {
  return $<HTMLInputElement>('keyterms').value.split(',').map((s) => s.trim()).filter(Boolean)
}

async function token(type: 'batch_scribe' | 'realtime_scribe') {
  const t0 = performance.now()
  const res = await fetch(`${TOKEN_URL}/token/${type}`, { method: 'POST' })
  if (!res.ok) throw new Error(`token server ${res.status}`)
  const { token } = await res.json()
  return { token: token as string, ms: performance.now() - t0 }
}

function b64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

// ---- batch ------------------------------------------------------------------

async function batch(pcm: Uint8Array, tok: string | null, kts: string[] = []) {
  const fd = new FormData()
  fd.append('model_id', 'scribe_v2')
  fd.append('language_code', 'en')
  fd.append('file_format', 'pcm_s16le_16')
  fd.append('file', new Blob([pcm as BlobPart], { type: 'application/octet-stream' }), 'clip.pcm')
  for (const k of kts) fd.append('keyterms', k)
  const url = tok ? `${API}/v1/speech-to-text?token=${encodeURIComponent(tok)}` : `${API}/v1/speech-to-text`
  const t0 = performance.now()
  try {
    const res = await fetch(url, { method: 'POST', body: fd })
    const body = await res.text()
    const ms = performance.now() - t0
    let text: string | null = null
    try {
      text = JSON.parse(body).text ?? null
    } catch {}
    return { ok: res.ok, status: res.status, ms, text, body: res.ok ? '' : body.slice(0, 200) }
  } catch (e) {
    // A CORS rejection surfaces here as a TypeError with no status.
    return { ok: false, status: 0, ms: performance.now() - t0, text: null, body: `fetch threw: ${e}` }
  }
}

// ---- realtime ---------------------------------------------------------------

type Rt = {
  send(pcm: Uint8Array, commit?: boolean): void
  close(): void
  ready: Promise<number>
}

function openRealtime(tok: string, kts: string[], on: (type: string, text: string, tMs: number) => void, commitStrategy = 'manual'): Rt {
  const qs = new URLSearchParams({ model_id: 'scribe_v2_realtime', token: tok, audio_format: 'pcm_16000', commit_strategy: commitStrategy, language_code: 'en' })
  for (const k of kts) qs.append('keyterms', k)
  const t0 = performance.now()
  const ws = new WebSocket(`${WSS}?${qs}`)
  let resolveReady: (ms: number) => void
  let rejectReady: (e: unknown) => void
  const ready = new Promise<number>((r, j) => ((resolveReady = r), (rejectReady = j)))
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    const t = performance.now() - t0
    if (msg.message_type === 'session_started') resolveReady(t)
    on(msg.message_type, msg.text ?? msg.error ?? '', t)
  }
  ws.onerror = () => {
    on('ws-error', '', performance.now() - t0)
    rejectReady(new Error('ws error'))
  }
  ws.onclose = (e) => on('ws-close', `${e.code} ${e.reason}`, performance.now() - t0)
  return {
    ready,
    send(pcm, commit = false) {
      ws.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: b64(pcm), commit, sample_rate: RATE }))
    },
    close: () => ws.close(),
  }
}

async function realtimeClip(id: string, kts: string[]) {
  const pcm = await clipPcm(id)
  const tk = await token('realtime_scribe')
  let tSpeechEnd = 0
  let tFirstPartial: number | null = null
  let tStream = 0
  return new Promise<any>((resolve) => {
    const out: any = { id, mintMs: Math.round(tk.ms) }
    const timer = setTimeout(() => (rt.close(), resolve({ ...out, error: 'timeout' })), 15000)
    const rt = openRealtime(tk.token, kts, (type, text, t) => {
      if (type === 'partial_transcript' && text && tFirstPartial == null) tFirstPartial = t - tStream
      if (type === 'committed_transcript') {
        clearTimeout(timer)
        rt.close()
        resolve({ ...out, text, firstPartialMs: tFirstPartial && Math.round(tFirstPartial), finalAfterEndMs: Math.round(t - tSpeechEnd) })
      }
      if (/error|ws-close/.test(type) && !out.done) {
        out.errors = [...(out.errors ?? []), `${type} ${text}`]
      }
    })
    rt.ready
      .then(async (sessionMs) => {
        // Event times are relative to WebSocket creation; rebuild that origin here.
        out.sessionMs = Math.round(sessionMs)
        const t0 = performance.now() - sessionMs
        const chunk = 3200 // 100 ms
        tStream = performance.now() - t0
        for (let off = 0; off < pcm.length; off += chunk) {
          const last = off + chunk >= pcm.length
          if (last) tSpeechEnd = performance.now() - t0
          rt.send(pcm.subarray(off, off + chunk), last)
          if (!last) await new Promise((r) => setTimeout(r, 100))
        }
      })
      .catch((e) => (clearTimeout(timer), resolve({ ...out, error: String(e) })))
  })
}

// ---- mic ----------------------------------------------------------------------

async function micStream(onPcm: (pcm: Uint8Array) => void) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
  const ctx = new AudioContext({ sampleRate: RATE })
  const src = ctx.createMediaStreamSource(stream)
  const proc = ctx.createScriptProcessor(2048, 1, 1)
  proc.onaudioprocess = (e) => {
    const f = e.inputBuffer.getChannelData(0)
    const out = new Int16Array(f.length)
    for (let i = 0; i < f.length; i++) out[i] = Math.max(-1, Math.min(1, f[i])) * 0x7fff
    onPcm(new Uint8Array(out.buffer))
  }
  src.connect(proc)
  proc.connect(ctx.destination)
  return () => {
    proc.disconnect()
    src.disconnect()
    stream.getTracks().forEach((t) => t.stop())
    ctx.close()
  }
}

function concat(parts: Uint8Array[]) {
  const n = parts.reduce((a, p) => a + p.length, 0)
  const out = new Uint8Array(n)
  let o = 0
  for (const p of parts) (out.set(p, o), (o += p.length))
  return out
}

// ---- wiring -------------------------------------------------------------------

const selected = () => $<HTMLSelectElement>('clip').value

$('batch').onclick = async () => {
  const tk = await token('batch_scribe')
  const r = await batch(await clipPcm(selected()), tk.token, keyterms())
  results.push({ kind: 'batch', id: selected(), mintMs: tk.ms, ...r })
  log(`batch ${selected()}: ${r.status} ${Math.round(r.ms)} ms (mint ${Math.round(tk.ms)}) -> ${JSON.stringify(r.text)} ${r.body}`, r.ok ? 'ok' : 'err')
}

$('direct').onclick = async () => {
  const r = await batch(await clipPcm(selected()), null)
  results.push({ kind: 'cors-probe', ...r })
  log(`no-auth probe: status ${r.status} (a 401 with a readable body means CORS allowed this origin) ${r.body}`, r.status === 401 ? 'ok' : 'err')
}

$('rt').onclick = async () => {
  const r = await realtimeClip(selected(), keyterms())
  results.push({ kind: 'realtime', ...r })
  log(`realtime ${r.id}: ${JSON.stringify(r)}`, r.text != null ? 'ok' : 'err')
}

$('allBatch').onclick = async () => {
  const ms: number[] = []
  for (const c of clips.filter((c) => c.kind === 'clean')) {
    const tk = await token('batch_scribe')
    const r = await batch(await clipPcm(c.id), tk.token)
    results.push({ kind: 'batch', id: c.id, mintMs: tk.ms, ...r })
    if (r.ok) ms.push(r.ms)
    log(`batch ${c.id}: ${r.status} ${Math.round(r.ms)} ms -> ${JSON.stringify(r.text)}`, r.ok ? 'ok' : 'err')
  }
  ms.sort((a, b) => a - b)
  log(`BATCH n=${ms.length} p50=${Math.round(ms[Math.ceil(ms.length * 0.5) - 1])} p95=${Math.round(ms[Math.ceil(ms.length * 0.95) - 1])}`, 'ok')
}

$('allRt').onclick = async () => {
  for (const c of clips.filter((c) => c.kind === 'clean')) {
    const r = await realtimeClip(c.id, [])
    results.push({ kind: 'realtime', ...r })
    log(`realtime ${c.id}: ${JSON.stringify(r)}`, r.text != null ? 'ok' : 'err')
  }
}

let stopRec: (() => void) | null = null
let recParts: Uint8Array[] = []
const recBtn = $('rec')
recBtn.onpointerdown = async () => {
  recParts = []
  try {
    stopRec = await micStream((p) => recParts.push(p))
    log('recording...')
  } catch (e) {
    log(`mic failed: ${e}`, 'err')
  }
}
recBtn.onpointerup = async () => {
  if (!stopRec) return
  stopRec()
  stopRec = null
  const pcm = concat(recParts)
  log(`recorded ${Math.round(pcm.length / 32)} ms; transcribing`)
  const tk = await token('batch_scribe')
  const r = await batch(pcm, tk.token, keyterms())
  results.push({ kind: 'mic-batch', keyterms: keyterms(), ...r })
  log(`mic batch: ${r.status} ${Math.round(r.ms)} ms -> ${JSON.stringify(r.text)}`, r.ok ? 'ok' : 'err')
}

let stopLive: (() => void) | null = null
$('live').onclick = async () => {
  if (stopLive) {
    stopLive()
    stopLive = null
    $('live').textContent = 'Start live realtime'
    return
  }
  const tk = await token('realtime_scribe')
  const rt = openRealtime(tk.token, keyterms(), (type, text, t) => {
    if (type !== 'session_started') log(`live ${type} @${Math.round(t)} ms: ${text}`, /error/.test(type) ? 'err' : '')
  }, 'vad')
  await rt.ready
  const stopMic = await micStream((p) => rt.send(p))
  stopLive = () => (stopMic(), rt.close())
  $('live').textContent = 'Stop live realtime'
  log('live realtime streaming (commit_strategy=vad)')
}

// ?auto=1 runs one batch + one realtime call on load and logs JSON, for WebViews
// we can't click into (Even simulator via its /api/console, or the Even app).
async function auto() {
  log(`AUTO start origin=${location.origin} ua=${navigator.userAgent}`)
  for (const id of ['cup', 'medicine']) {
    try {
      const tk = await token('batch_scribe')
      const r = await batch(await clipPcm(id), tk.token)
      log(`AUTO batch ${JSON.stringify({ id, status: r.status, ms: Math.round(r.ms), mintMs: Math.round(tk.ms), text: r.text, body: r.body })}`)
      const rt = await realtimeClip(id, [])
      log(`AUTO realtime ${JSON.stringify(rt)}`)
    } catch (e) {
      log(`AUTO failed ${id}: ${e}`, 'err')
    }
  }
  log('AUTO done')
}

loadClips().then(() => new URLSearchParams(location.search).has('auto') && auto())
