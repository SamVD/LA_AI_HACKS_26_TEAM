// Checks that an ElevenLabs key works from this machine for everything Nudge uses.
// No audio files needed (sends 1 s of silence); runs on macOS, Windows and Linux.
//   1. put ELEVENLABS_API_KEY=sk_... in .env.local at the repo root (gitignored), or in shell env
//   2. node spikes/stt/check-key.mjs
// Node 22+ for the realtime check (global WebSocket). Never prints the key.
import { loadKey, mintToken, batchTranscribe, SAMPLE_RATE } from './lib.mjs'

const ok = (m) => console.log(`  ✓ ${m}`)
const bad = (m, hint) => (console.log(`  ✗ ${m}${hint ? `\n      → ${hint}` : ''}`), (failed = true))
let failed = false

function hintFor(text) {
  if (/API key ID used as API key/.test(text)) return 'that is the key ID; use the secret that starts with sk_ (shown once when the key is created)'
  if (/missing the permission (\w+)/.test(text)) return `key lacks the "${text.match(/missing the permission (\w+)/)[1]}" permission; edit the key in ElevenLabs → Developers → API Keys`
  if (/Invalid API key/.test(text)) return 'key is wrong or was revoked; copy it again'
  if (/quota|credits/i.test(text)) return 'account is out of credits'
  return null
}

console.log(`Node ${process.version}`)
let key
try {
  key = loadKey()
  if (key.startsWith('sk_')) ok(`key loaded (${key.length} chars)`)
  else bad('key loaded but does not start with sk_', 'you may have pasted the key ID or something else')
} catch (e) {
  bad(String(e.message), 'add ELEVENLABS_API_KEY=sk_... as the last line of .env.local at the repo root')
  process.exit(1)
}

for (const type of ['batch_scribe', 'realtime_scribe']) {
  try {
    const t = await mintToken(key, type)
    ok(`mint ${type} token (${Math.round(t.ms)} ms)`)
  } catch (e) {
    const msg = String(e.message).replace(key, '<key>')
    bad(`mint ${type} token: ${msg.slice(0, 160)}`, hintFor(msg) ?? (/fetch failed/.test(msg) ? 'network: is api.elevenlabs.io reachable from this Wi-Fi?' : null))
  }
}

const silence = Buffer.alloc(SAMPLE_RATE * 2) // 1 s of 16 kHz s16le silence
try {
  const { token } = await mintToken(key, 'batch_scribe')
  const r = await batchTranscribe(silence, { token })
  if (r.ok) ok(`batch speech-to-text with a token (${Math.round(r.ms)} ms, HTTP ${r.status})`)
  else bad(`batch speech-to-text: HTTP ${r.status} ${r.error?.slice(0, 160)}`, hintFor(r.error ?? ''))
} catch (e) {
  bad(`batch speech-to-text: ${String(e.message).replace(key, '<key>').slice(0, 160)}`)
}

if (typeof WebSocket !== 'function') {
  bad('realtime check skipped: this Node has no global WebSocket', 'use Node 22 or newer')
} else {
  try {
    const { token } = await mintToken(key, 'realtime_scribe')
    const qs = new URLSearchParams({ model_id: 'scribe_v2_realtime', token, audio_format: 'pcm_16000', commit_strategy: 'manual', language_code: 'en' })
    const t0 = performance.now()
    const res = await new Promise((resolve) => {
      const ws = new WebSocket(`wss://api.elevenlabs.io/v1/speech-to-text/realtime?${qs}`)
      const timer = setTimeout(() => (ws.close(), resolve({ ok: false, why: 'no session_started within 8 s' })), 8000)
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data)
        clearTimeout(timer)
        ws.close()
        resolve(m.message_type === 'session_started' ? { ok: true } : { ok: false, why: `${m.message_type}: ${m.error ?? ''}` })
      }
      ws.onerror = () => (clearTimeout(timer), resolve({ ok: false, why: 'WebSocket error (network or firewall blocking wss)' }))
    })
    if (res.ok) ok(`realtime WebSocket session (${Math.round(performance.now() - t0)} ms)`)
    else bad(`realtime WebSocket: ${res.why}`, hintFor(res.why))
  } catch (e) {
    bad(`realtime WebSocket: ${String(e.message).replace(key, '<key>').slice(0, 160)}`)
  }
}

console.log(failed ? '\nSome checks failed (see → hints).' : '\nAll good: this machine can use ElevenLabs STT the way Nudge does.')
process.exit(failed ? 1 : 0)
