// T-203 end-to-end on a laptop: T-201's real client (createPredictor) -> the real api/predict
// handler on a local port -> real Gemini. Paced under the free-tier 15/min, then a deliberate
// burst to check that a real 429 is forwarded with Retry-After and the client falls back.
//   npx vite-node spikes/predictor/t203-e2e.ts [--rpm 14] [--skip-burst]
// Key: GEMINI_API_KEY in the shell or .env.local (never logged). Uses ~40 requests.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createPredictHandler } from '../../api/predict/_handler'
import { toWireRequest } from '../../src/ai/predictor/input'
import { createPredictor } from '../../src/ai/predictor/service'
import type { WordEntry } from '../../src/core/types'

const args = process.argv.slice(2)
const RPM = Number(args[args.indexOf('--rpm') + 1] || 14)
const key = process.env.GEMINI_API_KEY
  ?? (existsSync('.env.local') ? readFileSync('.env.local', 'utf8').match(/^\s*GEMINI_API_KEY\s*=\s*['"]?([^'"\s]+)/m)?.[1] : undefined)
if (!key) { console.error('GEMINI_API_KEY not set'); process.exit(1) }

const cases = JSON.parse(readFileSync('fixtures/predictor-eval.json', 'utf8')).cases as Array<{
  id: string; shape: string; transcriptTail: string; stalledAfter: string; n: number; intendedWord: string; acceptable?: string[]; place?: { lat: number; lon: number; label?: string }
}>
const bank = JSON.parse(readFileSync('src/content/words.json', 'utf8')) as WordEntry[]

// --- local server around the real handler ---------------------------------------
const serverLog: string[] = []
const handle = createPredictHandler({ apiKey: key, allowedOrigins: ['http://localhost:5173'], allowMissingOrigin: true, log: l => serverLog.push(l) })
const timings: Array<{ gemini: number; total: number }> = []
const server = createServer(async (req, res) => {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const headers = Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === 'string')) as Record<string, string>
  const out = await handle(new Request(`http://localhost${req.url}`, { method: req.method, headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined }))
  const st = out.headers.get('server-timing') ?? ''
  const g = Number(st.match(/gemini;dur=(\d+)/)?.[1]), t = Number(st.match(/total;dur=(\d+)/)?.[1])
  if (Number.isFinite(g)) timings.push({ gemini: g, total: t })
  res.writeHead(out.status, Object.fromEntries(out.headers)).end(Buffer.from(await out.arrayBuffer()))
})
await new Promise<void>(r => server.listen(0, r))
const endpoint = `http://localhost:${(server.address() as { port: number }).port}/api/predict`

const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : NaN }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// --- 1. paced eval through the real client ---------------------------------------
const reasons: Record<string, number> = {}
const predictor = createPredictor({
  endpoint, timeoutMs: 1200,
  log: (e, d) => { if (e === 'predictor.fallback') { const r = (d as { reason: string; status?: number }); const k = r.status ? `${r.reason} ${r.status}` : r.reason; reasons[k] = (reasons[k] ?? 0) + 1 } },
})
const rows = []
let next = Date.now()
for (const c of cases) {
  const wait = next - Date.now()
  if (wait > 0) await sleep(wait)
  next = Date.now() + 60_000 / RPM
  const t0 = performance.now()
  const items = await predictor.predict({ transcriptTail: c.transcriptTail, stalledAfter: c.stalledAfter, bank, n: c.n, place: c.place })
  const ms = Math.round(performance.now() - t0)
  const ok = new Set([c.intendedWord, ...(c.acceptable ?? [])].map(w => w.toLowerCase()))
  const words = items.map(s => s.word)
  rows.push({ id: c.id, shape: c.shape, ms, top1: ok.has((words[0] ?? '').toLowerCase()), top3: words.slice(0, 3).some(w => ok.has(w.toLowerCase())), source: items[0]?.source ?? '-', words: words.join(', ') })
}
console.table(rows)
const clientMs = rows.map(r => r.ms)
const summary = {
  n: rows.length,
  top1: +(rows.filter(r => r.top1).length / rows.length).toFixed(2),
  top3: +(rows.filter(r => r.top3).length / rows.length).toFixed(2),
  clientP50: pct(clientMs, 50), clientP95: pct(clientMs, 95), clientMax: Math.max(...clientMs),
  geminiP50: pct(timings.map(t => t.gemini), 50), geminiP95: pct(timings.map(t => t.gemini), 95),
  proxyOverheadP95: pct(timings.map(t => t.total - t.gemini), 95),
  fallbacks: reasons,
}
console.log('summary', summary)

// --- 2. a real 429: burst until Gemini refuses ------------------------------------
let burst: Record<string, unknown> = { skipped: true }
if (!args.includes('--skip-burst')) {
  const wire = toWireRequest({ transcriptTail: cases[0].transcriptTail, stalledAfter: cases[0].stalledAfter, bank, n: 3 })
  for (let i = 1; i <= 25; i++) {
    const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' }, body: JSON.stringify(wire) })
    const body = await res.text()
    if (res.status === 429) {
      burst = { after: i, status: 429, retryAfter: res.headers.get('retry-after'), exposed: res.headers.get('access-control-expose-headers'), body: JSON.parse(body) }
      break
    }
  }
  const before = { ...reasons }
  await predictor.predict({ transcriptTail: cases[0].transcriptTail, stalledAfter: cases[0].stalledAfter, bank, n: 3 })
  burst.clientFellBackWith = Object.keys(reasons).find(k => (reasons[k] ?? 0) > (before[k] ?? 0)) ?? 'none'
  console.log('burst', burst)
}

server.close()
const leaked = [JSON.stringify(rows), JSON.stringify(burst), ...serverLog].join('\n').includes(key)
writeFileSync('spikes/predictor/results/t203-e2e.json', JSON.stringify({ at: new Date().toISOString(), rpm: RPM, summary, burst, rows, serverLog }, null, 2))
console.log(leaked ? 'KEY LEAKED - do not commit results' : 'no key in results or logs')
process.exit(leaked ? 1 : 0)
