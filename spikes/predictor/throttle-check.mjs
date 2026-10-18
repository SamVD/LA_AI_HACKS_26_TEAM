// Checks throttle.mjs against the measured free-tier limit (15 requests/min/model).
//
//   node spikes/predictor/throttle-check.mjs          # fake-clock simulation, no key, ~1 s
//   node spikes/predictor/throttle-check.mjs --live   # 3 min against real Gemini (uses ~40 requests)
//
// Named *-check.mjs (not *.test.*) so CI's Vitest does not pick it up.

import { readFile, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPredictThrottle } from './throttle.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const LIMIT = 15
const WINDOW = 60_000

// --- fake clock --------------------------------------------------------------

function fakeClock() {
  let t = 0, seq = 0
  const q = [] // { at, id, fn }
  return {
    now: () => t,
    schedule: (fn, ms) => { const h = { at: t + Math.max(0, ms), id: seq++, fn }; q.push(h); return h },
    cancel: (h) => { const i = q.indexOf(h); if (i >= 0) q.splice(i, 1) },
    sleep(ms) { return new Promise((r) => this.schedule(r, ms)) },
    async run(untilMs) {
      const flush = () => new Promise((r) => setImmediate(r))
      for (;;) {
        await flush(); await flush()
        q.sort((a, b) => a.at - b.at || a.id - b.id)
        if (!q.length || q[0].at > untilMs) break
        const h = q.shift(); t = h.at; h.fn()
      }
      t = untilMs
    },
  }
}

// A fake Gemini that enforces the real quota: 429 if > `quota` calls in the last 60 s.
function fakeGemini(clock, { quota = LIMIT, latencyMs = 650, otherTrafficPerMin = 0 } = {}) {
  const hits = []
  const log = []
  const used = () => { while (hits.length && hits[0] <= clock.now() - WINDOW) hits.shift(); return hits.length }
  // someone else sharing the project quota
  if (otherTrafficPerMin) { const tick = () => { hits.push(clock.now()); clock.schedule(tick, WINDOW / otherTrafficPerMin) }; clock.schedule(tick, 0) }
  return {
    log,
    async predict(req) {
      const t = clock.now()
      log.push(t)
      if (used() >= quota) return { items: [], rateLimitedMs: 19_000 }
      hits.push(t)
      await clock.sleep(latencyMs)
      return { items: [{ word: `w${req.seq}`, confidence: 0.8 }] }
    },
  }
}

const maxInWindow = (ts) => { let m = 0, j = 0; for (let i = 0; i < ts.length; i++) { while (ts[i] - ts[j] >= WINDOW) j++; m = Math.max(m, i - j + 1) }; return m }

async function scenario(name, { events, durationMs, gemini: gopts }) {
  const clock = fakeClock()
  const g = fakeGemini(clock, gopts)
  const helps = []
  const th = createPredictThrottle({ predict: g.predict, fallback: () => [{ word: 'bank', confidence: 0.1 }], now: clock.now, schedule: clock.schedule.bind(clock), cancel: clock.cancel })
  for (const e of events) clock.schedule(() => {
    if (e.type === 'final') th.onFinal({ seq: e.seq })
    else { const t0 = clock.now(); th.onHelp().then((r) => helps.push({ from: r.from, waitMs: clock.now() - t0 })) }
  }, e.tMs)
  await clock.run(durationMs)
  th.stop()
  const from = helps.reduce((m, h) => ((m[h.from] = (m[h.from] ?? 0) + 1), m), {})
  return { name, finals: events.filter((e) => e.type === 'final').length, taps: helps.length, modelCalls: g.log.length, maxPerMin: maxInWindow(g.log), rateLimited: th.stats.rateLimited, coalesced: th.stats.coalesced, tapFrom: JSON.stringify(from), tapMaxWaitMs: Math.max(0, ...helps.map((h) => h.waitMs)) }
}

// --- scenarios ---------------------------------------------------------------

async function fixtureEvents() {
  const dir = join(ROOT, 'fixtures', 'conversations')
  const events = []
  let offset = 0, seq = 0
  for (const f of (await readdir(dir)).filter((x) => x.endsWith('.json')).sort()) {
    const c = JSON.parse(await readFile(join(dir, f), 'utf8'))
    for (const e of c.events) if (e.type === 'transcript' && e.isFinal) events.push({ type: 'final', tMs: offset + e.tMs, seq: seq++ })
    for (const s of c.stalls) events.push({ type: 'help', tMs: offset + s.tMs + 800 }) // tap ~0.8 s into the stall
    offset += c.events.at(-1).tMs + 2000
  }
  return { events, durationMs: offset }
}
const stream = (finalEveryMs, tapEveryMs, durationMs) => {
  const ev = []
  for (let t = 0, s = 0; t < durationMs; t += finalEveryMs) ev.push({ type: 'final', tMs: t, seq: s++ })
  for (let t = tapEveryMs; t < durationMs; t += tapEveryMs) ev.push({ type: 'help', tMs: t })
  return ev
}

if (!process.argv.includes('--live')) {
  const fx = await fixtureEvents()
  const rows = [
    await scenario('8 fixture conversations back to back', fx),
    await scenario('busy talk: final every 2 s, tap every 10 s, 10 min', { events: stream(2000, 10_000, 600_000), durationMs: 600_000 }),
    await scenario('worst case: final every 1 s, tap every 4 s, 10 min', { events: stream(1000, 4000, 600_000), durationMs: 600_000 }),
    await scenario('shared quota: +6 req/min from elsewhere', { events: stream(1500, 8000, 300_000), durationMs: 300_000, gemini: { otherTrafficPerMin: 6 } }),
    await scenario('no throttle baseline would be (finals 1 s)', { events: [], durationMs: 0 }).then((r) => ({ ...r, name: 'unthrottled (finals every 1 s) = 60/min, 429 after 15', modelCalls: '-', maxPerMin: 60 })),
  ]
  console.table(rows)
  const real = rows.slice(0, 3)
  const ok = real.every((r) => r.maxPerMin <= LIMIT && r.rateLimited === 0 && r.tapMaxWaitMs <= 700) && rows[3].tapMaxWaitMs <= 700
  console.log(ok ? 'PASS: never above 15/min, no 429s on our own traffic, every tap answered within one model call' : 'FAIL')
  process.exit(ok ? 0 : 1)
}

// --- live --------------------------------------------------------------------

const { existsSync, readFileSync } = await import('node:fs')
const KEY = process.env.GEMINI_API_KEY ?? (existsSync(join(ROOT, '.env.local')) ? readFileSync(join(ROOT, '.env.local'), 'utf8').match(/^\s*GEMINI_API_KEY\s*=\s*['"]?([^'"\s]+)/m)?.[1] : undefined)
if (!KEY) { console.error('GEMINI_API_KEY not set'); process.exit(1) }
const MODEL = 'gemini-3.5-flash-lite'
const log = []
async function livePredict(req) {
  const t0 = Date.now()
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: `Say one word that follows: "segment ${req.seq}, can you pass me the"` }] }], generationConfig: { maxOutputTokens: 5, thinkingConfig: { thinkingLevel: 'minimal' } } }),
  }).catch(() => null)
  const status = res?.status ?? 0
  log.push({ t: t0, status, ms: Date.now() - t0 })
  if (status === 429) {
    const j = await res.json().catch(() => ({}))
    const d = Number(JSON.stringify(j).match(/"retryDelay":"(\d+(?:\.\d+)?)s"/)?.[1] ?? 20)
    return { items: [], rateLimitedMs: d * 1000 }
  }
  await res?.text()
  return { items: status === 200 ? [{ word: 'x', confidence: 0.5 }] : [] }
}
const th = createPredictThrottle({ predict: livePredict, fallback: () => [{ word: 'bank', confidence: 0.1 }] })
const DUR = 180_000, t0 = Date.now(), taps = []
let s = 0
const fin = setInterval(() => th.onFinal({ seq: s++ }), 1500)
const tap = setInterval(async () => { const a = Date.now(); const r = await th.onHelp(); taps.push({ from: r.from, ms: Date.now() - a }) }, 8000)
console.log(`live: ${MODEL}, final every 1.5 s, tap every 8 s, ${DUR / 1000} s ...`)
await new Promise((r) => setTimeout(r, DUR))
clearInterval(fin); clearInterval(tap); th.stop()
await new Promise((r) => setTimeout(r, 2000))
const ts = log.map((l) => l.t)
const n429 = log.filter((l) => l.status === 429).length
console.log({ seconds: (Date.now() - t0) / 1000, finals: s, modelCalls: log.length, maxPerMin: maxInWindow(ts), http429: n429, non200: log.filter((l) => l.status !== 200).length, taps: taps.length, tapFrom: taps.reduce((m, x) => ((m[x.from] = (m[x.from] ?? 0) + 1), m), {}), tapMaxMs: Math.max(...taps.map((x) => x.ms)) })
console.log(n429 === 0 ? 'PASS (live): 0 rate-limit errors' : 'FAIL (live): got 429s')
process.exit(n429 === 0 ? 0 : 1)
