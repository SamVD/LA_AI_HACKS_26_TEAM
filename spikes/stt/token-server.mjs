// Prototype of what api/stt must do: hold the ElevenLabs key server-side and
// mint single-use tokens for the browser. Node built-ins only.
//   node spikes/stt/token-server.mjs     -> http://0.0.0.0:8787
//   POST /token/realtime_scribe | /token/batch_scribe  -> { token, mintMs }
// The key never leaves this process and is never logged.
import { createServer } from 'node:http'
import { loadKey, mintToken } from './lib.mjs'

const key = loadKey()
const PORT = Number(process.env.PORT ?? 8787)
const TYPES = new Set(['realtime_scribe', 'batch_scribe'])

createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*') // dev only; api/stt uses an allow-list
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  if (req.method === 'OPTIONS') return res.writeHead(204).end()
  const m = req.url?.match(/^\/token\/([a-z_]+)$/)
  if (req.method !== 'POST' || !m || !TYPES.has(m[1])) return res.writeHead(404).end()
  try {
    const t = await mintToken(key, m[1])
    console.log(`${new Date().toISOString()} ${req.headers.origin ?? '-'} ${m[1]} ${Math.round(t.ms)} ms`)
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ token: t.token, mintMs: Math.round(t.ms) }))
  } catch (e) {
    console.error(String(e).replace(key, '<key>'))
    res.writeHead(502, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'mint failed' }))
  }
}).listen(PORT, '0.0.0.0', () => console.log(`token server on :${PORT}`))
