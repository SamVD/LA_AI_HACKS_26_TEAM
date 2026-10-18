// T-201 eval: top-1 / top-3 accuracy of the predictor on fixtures/predictor-eval.json.
//   npx vite-node scripts/eval-predictor.ts                                   # offline: bank-only fallback
//   npx vite-node scripts/eval-predictor.ts --endpoint https://<host>/api/predict   # live, through T-203's proxy
// vite-node ships with vitest (no new dependency). The bank is all of
// src/content/words.json, `sample` entries kept: they are the names and
// medications the cases test.
import { readFileSync } from 'node:fs'
import type { WordEntry } from '../src/core/types'
import { createPredictor } from '../src/ai/predictor/service'
import { type EvalCase, runEval } from '../src/ai/predictor/evaluate'

const args = process.argv.slice(2)
const opt = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const endpoint = opt('--endpoint')
const timeoutMs = Number(opt('--timeout') ?? 1200)

const root = new URL('..', import.meta.url)
const cases: EvalCase[] = JSON.parse(readFileSync(new URL('fixtures/predictor-eval.json', root), 'utf8')).cases
const bank: WordEntry[] = JSON.parse(readFileSync(new URL('src/content/words.json', root), 'utf8'))

const reasons: Record<string, number> = {}
const log = (event: string, data?: unknown) => {
  if (event === 'predictor.fallback') {
    const reason = (data as { reason: string }).reason
    reasons[reason] = (reasons[reason] ?? 0) + 1
  }
}

// Offline: a fresh predictor per case, so suggestion history can't leak between cases.
// Live: one predictor, like the app.
const live = endpoint ? createPredictor({ endpoint, timeoutMs, log }) : null
const { rows, summary } = await runEval(cases, bank, r => (live ?? createPredictor({ log })).predict(r))

console.log(`mode: ${endpoint ? `live via ${endpoint} (timeout ${timeoutMs} ms)` : 'offline (bank-only fallback)'}`)
console.table(rows.map(r => ({ id: r.id, shape: r.shape, top3: r.top3 ? '✓' : '✗', words: r.words.join(', '), ms: r.ms })))
console.table(summary.byShape)
console.log(`top-1 ${summary.top1}   top-3 ${summary.top3}   n=${summary.n}${endpoint ? `   p50 ${summary.p50Ms} ms   p95 ${summary.p95Ms} ms` : ''}`)
console.log(`fallbacks: ${JSON.stringify(reasons)}`)
