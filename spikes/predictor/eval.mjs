// S-2 spike: run docs/PREDICTOR_PROMPT.md against fixtures/predictor-eval.json.
//
// The system prompt, response schema and few-shot examples are parsed out of
// PREDICTOR_PROMPT.md at run time, so the spike always tests the doc as written.
//
// Configs:
//   zero-shot  prompt v1, one user turn
//   few-shot   prompt v1 plus Examples 1-7 as user/model turns
//   fallback   Section 7 bank-only ranking, no model call
//
// Usage (Node 20+, built-ins only):
//   GEMINI_API_KEY=... node spikes/predictor/eval.mjs [--models a,b] [--reps 2] [--configs zero-shot,few-shot,fallback]
//   node spikes/predictor/eval.mjs --offline      # fallback + validator self-check, no key needed
// The key is read from the env or from .env.local at the repo root (gitignored). It is never logged or written.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const RESULTS = join(HERE, 'results')
const API = 'https://generativelanguage.googleapis.com/v1beta'
const TIMEOUT_MS = 1200 // client budget from PREDICTOR_PROMPT.md Section 2
const HARD_TIMEOUT_MS = 10000 // only so a hung call can't stall the run; we still measure past 1.2 s

const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const OFFLINE = flag('--offline')
const MODELS = opt('--models', 'gemini-3.5-flash-lite').split(',')
const REPS = Number(opt('--reps', 2))
const CONFIGS = opt('--configs', OFFLINE ? 'fallback' : 'zero-shot,few-shot,fallback').split(',')

async function loadKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY
  const f = join(ROOT, '.env.local')
  if (!existsSync(f)) return undefined
  const m = (await readFile(f, 'utf8')).match(/^\s*GEMINI_API_KEY\s*=\s*['"]?([^'"\s]+)/m)
  return m?.[1]
}
const KEY = OFFLINE ? undefined : await loadKey()
if (!OFFLINE && !KEY) {
  console.error('Set GEMINI_API_KEY in your shell or in .env.local at the repo root (never commit it). Or run with --offline.')
  process.exit(1)
}
const scrub = (s) => (KEY ? String(s).split(KEY).join('<key>') : String(s))

// --- prompt doc -------------------------------------------------------------

const doc = await readFile(join(ROOT, 'docs', 'PREDICTOR_PROMPT.md'), 'utf8')
const section = (n) => doc.split(/^## /m).find((s) => s.startsWith(`${n}. `)) ?? ''
const fences = (s, lang) => [...s.matchAll(new RegExp('```' + lang + '\\n([\\s\\S]*?)```', 'g'))].map((m) => m[1].trim())

const PROMPT_VERSION = Number(doc.match(/\*\*Prompt version: (\d+)\.\*\*/)?.[1])
const SYSTEM_PROMPT = fences(section(3), 'text')[0]
const RESPONSE_SCHEMA = JSON.parse(fences(section(5), 'json')[0])
const EXAMPLES = section(8).split(/^### /m).slice(1).map((s) => {
  const [input, output] = fences(s, 'json')
  return { title: s.split('\n')[0], input: JSON.parse(input), output: JSON.parse(output) }
})
if (!SYSTEM_PROMPT || !RESPONSE_SCHEMA || EXAMPLES.length !== 7) throw new Error(`prompt doc parse failed (examples: ${EXAMPLES.length})`)

// --- fixtures ---------------------------------------------------------------

const words = JSON.parse(await readFile(join(ROOT, 'src', 'content', 'words.json'), 'utf8'))
const BANK = Array.isArray(words) ? words : words.words
const EVAL = JSON.parse(await readFile(join(ROOT, 'fixtures', 'predictor-eval.json'), 'utf8')).cases

// --- Section 4: input building ---------------------------------------------

const PERSONAL = new Set(['person', 'place', 'medication'])
function tail(text) {
  let t = text.trim()
  const w = t.split(/\s+/)
  if (w.length > 40) t = w.slice(-40).join(' ')
  while (t.length > 300) t = t.slice(t.indexOf(' ') + 1)
  return t
}
function buildInput(req) {
  // S-2 keeps `sample` entries: they are the names and medications the cases test.
  const bank = [...req.bank.filter((e) => PERSONAL.has(e.category)), ...req.bank.filter((e) => !PERSONAL.has(e.category))]
    .slice(0, 150)
    .map(({ word, category, tags }) => ({ word, category, tags }))
  const input = { transcript: `${tail(req.transcriptTail)} [STALL]`, stalledAfter: req.stalledAfter, bank }
  if (req.place?.label) input.place = req.place.label
  input.n = Math.min(5, Math.max(1, req.n ?? 3))
  return input
}

// --- Section 6: client validation ------------------------------------------

const STOP = new Set('um uh er hmm the a an and or but with like it that this thing stuff something'.split(' '))
const lastWord = (s) => (s.toLowerCase().match(/[a-z']+/g) ?? []).pop() ?? ''
const singular = (w) => w.toLowerCase().replace(/(?<=[^s])s$/, '')

function validate(rawText, req) {
  let parsed
  try { parsed = JSON.parse(rawText) } catch { return { valid: false, reason: 'parse', items: [], dropped: 0 } }
  if (!Array.isArray(parsed)) return { valid: false, reason: 'not-array', items: [], dropped: 0 }
  const last = lastWord(req.stalledAfter)
  const byKey = new Map()
  let dropped = 0
  for (const it of parsed) {
    if (!it || typeof it !== 'object' || typeof it.word !== 'string' || typeof it.confidence !== 'number' || !Number.isFinite(it.confidence)) { dropped++; continue }
    let w = it.word.trim().replace(/\s+/g, ' ').replace(/^[\s"'`.,;:!?()[\]{}]+|[\s"'`,;:!?()[\]{}]+$/g, '').replace(/\.$/, (m) => (/\b(dr|mr|mrs|ms|st)\.$/i.test(it.word.trim()) ? m : ''))
    w = w.replace(/^(the|a|an)\s+/i, '')
    if (w.length < 1 || w.length > 40 || w.split(' ').length > 3 || !/^[A-Za-z][A-Za-z .'-]*$/.test(w)) { dropped++; continue }
    if (STOP.has(w.toLowerCase()) || w.toLowerCase() === last) { dropped++; continue }
    const conf = Math.min(1, Math.max(0, it.confidence))
    const entry = req.bank.find((e) => e.word.toLowerCase() === w.toLowerCase())
    const s = { word: entry ? entry.word : w, confidence: conf, source: entry ? 'bank' : 'model' }
    const k = singular(w)
    const prev = byKey.get(k)
    if (prev) { dropped++; if (conf > prev.confidence) byKey.set(k, s) } else byKey.set(k, s)
  }
  const items = [...byKey.values()].sort((a, b) => b.confidence - a.confidence).slice(0, req.n ?? 3)
  return items.length ? { valid: true, items, dropped } : { valid: false, reason: 'empty-after-validation', items, dropped }
}

// --- Section 7: bank-only fallback -----------------------------------------

const toks = (s) => s.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter(Boolean)
const FAMILY = /\bmy (daughter|son|wife|husband|friend|doctor|nurse)\b/
function fallback(req) {
  const t = toks(req.transcriptTail).slice(-40)
  const tset = new Set(t)
  const tstr = ` ${t.join(' ')} `
  const after = req.stalledAfter.toLowerCase()
  const place = new Set(toks(req.place?.label ?? ''))
  const scored = req.bank.map((e) => {
    let score = 0
    // tags may be multi-word ("blood pressure"): match them as whole-token phrases
    for (const tag of e.tags) if (tag !== 'sample' && tstr.includes(` ${toks(tag).join(' ')} `)) score += 1
    for (const w of toks(e.word)) if (tset.has(w)) score += 1
    if (e.category === 'medication' && /\b(take|took|my pills?)\b/.test(after)) score += 0.5
    if (e.category === 'person' && (FAMILY.test(after) || /\b(call|see|talk to)\b/.test(after))) score += 0.5
    if (e.category === 'place' && /\b(to the|at the|go to)\b/.test(after)) score += 0.5
    if (tstr.includes(` ${toks(e.word).join(' ')} `)) score += 0.5 // recency: said earlier (no suggestion history in the spike)
    if (e.tags.some((tag) => place.has(tag))) score += 0.25
    return { e, score }
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score)
  const n = req.n ?? 3
  if (scored.length) return scored.slice(0, n).map(({ e, score }) => ({ word: e.word, confidence: Math.min(0.6, 0.15 * score), source: 'bank' }))
  return req.bank.filter((e) => PERSONAL.has(e.category)).slice(0, n).map((e) => ({ word: e.word, confidence: 0.05, source: 'bank' }))
}

// --- Gemini ----------------------------------------------------------------

let THINKING = null // generationConfig fragment that the probe found the model accepts

function body(input, fewShot) {
  const contents = []
  if (fewShot) for (const ex of EXAMPLES) {
    contents.push({ role: 'user', parts: [{ text: JSON.stringify(ex.input) }] })
    contents.push({ role: 'model', parts: [{ text: JSON.stringify(ex.output) }] })
  }
  contents.push({ role: 'user', parts: [{ text: JSON.stringify(input) }] })
  return {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, temperature: 0.2, maxOutputTokens: 128, ...(THINKING ?? {}) },
  }
}

async function gemini(model, payload) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), HARD_TIMEOUT_MS)
  const t0 = performance.now()
  try {
    const res = await fetch(`${API}/models/${model}:generateContent`, {
      method: 'POST', signal: ac.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify(payload),
    })
    const ttfbMs = Math.round(performance.now() - t0)
    const json = await res.json().catch(() => ({}))
    const totalMs = Math.round(performance.now() - t0)
    if (!res.ok) return { ok: false, status: res.status, ttfbMs, totalMs, error: scrub(JSON.stringify(json.error ?? json)).slice(0, 400) }
    const cand = json.candidates?.[0]
    const text = (cand?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('')
    return { ok: true, status: res.status, ttfbMs, totalMs, text, finishReason: cand?.finishReason, usage: json.usageMetadata }
  } catch (e) {
    return { ok: false, status: 0, ttfbMs: null, totalMs: Math.round(performance.now() - t0), error: scrub(e.name === 'AbortError' ? 'hard-timeout' : e.message) }
  } finally { clearTimeout(timer) }
}

async function listModels() {
  const res = await fetch(`${API}/models?pageSize=1000`, { headers: { 'x-goog-api-key': KEY } })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) return { error: scrub(JSON.stringify(j.error ?? j)).slice(0, 300) }
  return (j.models ?? []).map((m) => m.name.replace(/^models\//, '')).filter((n) => /flash/.test(n))
}

// Try thinking configs from least to most thinking; keep the first one the API accepts.
async function probeThinking(model) {
  const variants = [
    { label: 'thinkingLevel=minimal', cfg: { thinkingConfig: { thinkingLevel: 'minimal' } } },
    { label: 'thinkingBudget=0', cfg: { thinkingConfig: { thinkingBudget: 0 } } },
    { label: 'thinkingLevel=low', cfg: { thinkingConfig: { thinkingLevel: 'low' } } },
    { label: 'model default', cfg: {} },
  ]
  const tried = []
  const input = buildInput({ ...EVAL[0], bank: BANK })
  for (const v of variants) {
    THINKING = v.cfg
    const r = await gemini(model, body(input, false))
    tried.push({ label: v.label, status: r.status, ok: r.ok, totalMs: r.totalMs, thoughtsTokens: r.usage?.thoughtsTokenCount ?? 0, error: r.error })
    if (r.ok) return { chosen: v.label, tried }
  }
  THINKING = null
  return { chosen: null, tried }
}

// --- scoring ---------------------------------------------------------------

const norm = (s) => s.toLowerCase().trim()
function score(c, items) {
  const ok = new Set([c.intendedWord, ...(c.acceptable ?? [])].map(norm))
  const ws = items.map((s) => norm(s.word))
  return { top1: ws.length > 0 && ok.has(ws[0]), top3: ws.slice(0, 3).some((w) => ok.has(w)), intendedTop3: ws.slice(0, 3).includes(norm(c.intendedWord)) }
}
const pct = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] }
const rate = (xs) => (xs.length ? +(xs.filter(Boolean).length / xs.length).toFixed(3) : null)

function summarize(rows) {
  const lat = rows.filter((r) => r.totalMs != null && r.httpOk).map((r) => r.totalMs)
  const ttfb = rows.filter((r) => r.ttfbMs != null && r.httpOk).map((r) => r.ttfbMs)
  return {
    n: rows.length,
    top1: rate(rows.map((r) => r.top1)),
    top3: rate(rows.map((r) => r.top3)),
    intendedTop3: rate(rows.map((r) => r.intendedTop3)),
    // what the user would actually see with the 1.2 s budget: model if in time and valid, else fallback
    top3At1200: rate(rows.map((r) => r.top3At1200)),
    p50: pct(lat, 0.5), p95: pct(lat, 0.95), ttfbP50: pct(ttfb, 0.5),
    jsonValid: rate(rows.filter((r) => r.httpOk).map((r) => r.jsonValid)),
    itemsDropped: rows.reduce((a, r) => a + (r.dropped ?? 0), 0),
    errors: rows.filter((r) => !r.httpOk && r.model !== 'none').length,
    over1200: rows.filter((r) => r.totalMs != null && r.totalMs > TIMEOUT_MS).length,
  }
}

// --- self-check: the validator must accept the doc's own example outputs ----

function selfCheck() {
  const fails = []
  for (const ex of EXAMPLES) {
    const req = { bank: ex.input.bank.map((b) => ({ ...b })), stalledAfter: ex.input.stalledAfter, n: ex.input.n }
    const v = validate(JSON.stringify(ex.output), req)
    if (!v.valid || v.items.length !== ex.output.length) fails.push({ ex: ex.title, v })
  }
  const bad = validate(JSON.stringify([{ word: 'um', confidence: 0.9 }, { word: 'the cups', confidence: 0.4 }, { word: 'cup', confidence: 2 }, { word: 'x1!', confidence: 0.1 }]), { bank: BANK, stalledAfter: 'pass me the', n: 3 })
  if (bad.items.length !== 1 || bad.items[0].word !== 'cup' || bad.items[0].confidence !== 1 || bad.items[0].source !== 'bank') fails.push({ ex: 'adversarial', v: bad })
  if (validate('not json', { bank: BANK, stalledAfter: '', n: 3 }).valid) fails.push({ ex: 'parse' })
  return fails
}

// --- main ------------------------------------------------------------------

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
await mkdir(RESULTS, { recursive: true })
const run = { at: new Date().toISOString(), promptVersion: PROMPT_VERSION, timeoutMs: TIMEOUT_MS, reps: OFFLINE ? 0 : REPS, cases: EVAL.length, bankSize: BANK.length }

const sc = selfCheck()
console.log(`validator self-check: ${sc.length ? 'FAIL' : 'ok'}`)
if (sc.length) { console.error(JSON.stringify(sc, null, 2)); process.exit(1) }

const fbByCase = new Map(EVAL.map((c) => [c.id, fallback({ ...c, bank: BANK })]))
const rows = []

if (!OFFLINE) {
  run.flashModelsListed = await listModels()
  console.log('flash models listed by API:', run.flashModelsListed)
  run.thinkingProbe = {}
}

for (const model of OFFLINE ? [] : MODELS) {
  const probe = await probeThinking(model)
  run.thinkingProbe[model] = probe
  console.log(model, 'thinking probe:', JSON.stringify(probe))
  if (!probe.chosen) { console.error(`${model}: no generationConfig accepted, skipping`); continue }
  for (const config of CONFIGS.filter((c) => c !== 'fallback')) {
    for (let rep = 0; rep < REPS; rep++) {
      for (const c of EVAL) {
        const req = { ...c, bank: BANK }
        const r = await gemini(model, body(buildInput(req), config === 'few-shot'))
        const v = r.ok ? validate(r.text, req) : { valid: false, reason: 'http', items: [], dropped: 0 }
        let jsonValid = false
        try { jsonValid = r.ok && Array.isArray(JSON.parse(r.text)) } catch {}
        const s = score(c, v.items)
        const inTime = r.ok && v.valid && r.totalMs <= TIMEOUT_MS
        const row = {
          model, config, rep, id: c.id, shape: c.shape, inBank: c.inBank, intended: c.intendedWord,
          httpOk: r.ok, status: r.status, ttfbMs: r.ttfbMs, totalMs: r.totalMs, jsonValid, valid: v.valid, reason: v.reason, dropped: v.dropped,
          suggestions: v.items.map((i) => `${i.word}:${i.confidence.toFixed(2)}`), raw: r.ok ? r.text : r.error,
          finishReason: r.finishReason, thoughtsTokens: r.usage?.thoughtsTokenCount ?? 0,
          ...s, top3At1200: inTime ? s.top3 : score(c, fbByCase.get(c.id)).top3,
        }
        rows.push(row)
        console.log(`${model} ${config} r${rep} ${c.id} ${row.totalMs}ms ${row.top3 ? 'HIT ' : 'miss'} ${row.suggestions.join(' ')}${r.ok ? '' : ' ERR ' + r.error}`)
      }
    }
  }
}

if (CONFIGS.includes('fallback')) {
  for (const c of EVAL) {
    const items = fbByCase.get(c.id)
    const s = score(c, items)
    rows.push({ model: 'none', config: 'fallback', rep: 0, id: c.id, shape: c.shape, inBank: c.inBank, intended: c.intendedWord, httpOk: true, totalMs: null, ttfbMs: null, jsonValid: true, valid: items.length > 0, dropped: 0, suggestions: items.map((i) => `${i.word}:${i.confidence.toFixed(2)}`), ...s, top3At1200: s.top3 })
  }
}

// summaries: per model x config (all reps), per rep (for spread), per shape
const groups = (keyFn) => rows.reduce((m, r) => { const k = keyFn(r); (m[k] ??= []).push(r); return m }, {})
run.summary = Object.fromEntries(Object.entries(groups((r) => `${r.model} | ${r.config}`)).map(([k, rs]) => [k, summarize(rs)]))
run.spread = Object.fromEntries(Object.entries(groups((r) => `${r.model} | ${r.config} | rep ${r.rep}`)).map(([k, rs]) => [k, summarize(rs)]))
run.byShape = Object.fromEntries(Object.entries(groups((r) => `${r.model} | ${r.config} | ${r.shape}`)).map(([k, rs]) => [k, { n: rs.length, top1: rate(rs.map((r) => r.top1)), top3: rate(rs.map((r) => r.top3)) }]))
const misses = groups((r) => `${r.model} | ${r.config}`)
run.worstMisses = Object.fromEntries(Object.entries(misses).map(([k, rs]) => [k, rs.filter((r) => !r.top3).sort((a, b) => (b.valid - a.valid)).slice(0, 5).map(({ id, shape, intended, suggestions, raw, rep }) => ({ id, rep, shape, intended, suggestions, raw }))]))

console.log('\nsummary'); console.table(run.summary)

// markdown tables to paste into FINDINGS.md
const md = [
  `# S-2 run ${run.at} (prompt v${PROMPT_VERSION}, ${EVAL.length} cases x ${run.reps} reps)`, '',
  '| model | config | top-1 | top-3 | intended in top-3 | top-3 with 1.2 s budget | p50 ms | p95 ms | TTFB p50 | JSON valid | dropped | errors | >1.2 s |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...Object.entries(run.summary).map(([k, s]) => `| ${k.split(' | ').join(' | ')} | ${s.top1} | ${s.top3} | ${s.intendedTop3} | ${s.top3At1200} | ${s.p50 ?? '-'} | ${s.p95 ?? '-'} | ${s.ttfbP50 ?? '-'} | ${s.jsonValid} | ${s.itemsDropped} | ${s.errors} | ${s.over1200} |`),
  '', '## Spread by rep', '', '| run | top-1 | top-3 | p50 | p95 |', '|---|---|---|---|---|',
  ...Object.entries(run.spread).map(([k, s]) => `| ${k} | ${s.top1} | ${s.top3} | ${s.p50 ?? '-'} | ${s.p95 ?? '-'} |`),
  '', '## By shape (top-1 / top-3)', '', '| run | shape | n | top-1 | top-3 |', '|---|---|---|---|---|',
  ...Object.entries(run.byShape).map(([k, s]) => { const [m, c, sh] = k.split(' | '); return `| ${m} ${c} | ${sh} | ${s.n} | ${s.top1} | ${s.top3} |` }),
  '', '## Worst misses', '',
  ...Object.entries(run.worstMisses).flatMap(([k, ms]) => [`### ${k}`, '', ...ms.map((m) => `- ${m.id} (${m.shape}, r${m.rep}) wanted **${m.intended}**, got ${m.suggestions.join(', ') || '(none)'}${m.raw ? `; raw: \`${String(m.raw).replace(/`/g, "'").slice(0, 200)}\`` : ''}`), '']),
].join('\n')

const tag = OFFLINE ? 'offline' : MODELS.join('+')
await writeFile(join(RESULTS, `${stamp}-${tag}.json`), JSON.stringify({ ...run, rows }, null, 2))
await writeFile(join(RESULTS, `${stamp}-${tag}.md`), md)
console.log(`wrote results/${stamp}-${tag}.{json,md}`)
