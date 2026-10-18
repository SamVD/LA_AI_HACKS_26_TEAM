import type { PredictRequest, Suggestion, WordEntry } from '../../core/types'

/** One case of fixtures/predictor-eval.json. */
export interface EvalCase {
  id: string
  shape: string
  transcriptTail: string
  stalledAfter: string
  n: number
  intendedWord: string
  acceptable: string[]
  inBank: boolean
  place?: { lat: number; lon: number; label?: string }
}

export interface EvalRow {
  id: string
  shape: string
  words: string[]
  sources: string[]
  top1: boolean
  top3: boolean
  ms: number
}

export interface EvalSummary {
  n: number
  top1: number
  top3: number
  byShape: Record<string, { n: number; top1: number; top3: number }>
  p50Ms: number
  p95Ms: number
}

/** S-2's definition: a hit when intendedWord or any acceptable word is in the top k, case-insensitive. */
export function isHit(c: EvalCase, items: Suggestion[], k: number): boolean {
  const wanted = new Set([c.intendedWord, ...c.acceptable].map(w => w.toLocaleLowerCase('en')))
  return items.slice(0, k).some(s => wanted.has(s.word.toLocaleLowerCase('en')))
}

export function toRequest(c: EvalCase, bank: WordEntry[]): PredictRequest {
  return { transcriptTail: c.transcriptTail, stalledAfter: c.stalledAfter, bank, n: c.n, ...(c.place ? { place: c.place } : {}) }
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))] : NaN
}
const ratio = (rows: EvalRow[], key: 'top1' | 'top3') => Math.round((rows.filter(r => r[key]).length / rows.length) * 100) / 100

export async function runEval(
  cases: EvalCase[],
  bank: WordEntry[],
  predict: (r: PredictRequest) => Promise<Suggestion[]>,
  clock: () => number = () => performance.now(),
): Promise<{ rows: EvalRow[]; summary: EvalSummary }> {
  const rows: EvalRow[] = []
  for (const c of cases) {
    const t0 = clock()
    const items = await predict(toRequest(c, bank))
    rows.push({
      id: c.id,
      shape: c.shape,
      words: items.map(s => s.word),
      sources: items.map(s => s.source),
      top1: isHit(c, items, 1),
      top3: isHit(c, items, 3),
      ms: Math.round(clock() - t0),
    })
  }
  const byShape: EvalSummary['byShape'] = {}
  for (const shape of [...new Set(rows.map(r => r.shape))]) {
    const sel = rows.filter(r => r.shape === shape)
    byShape[shape] = { n: sel.length, top1: ratio(sel, 'top1'), top3: ratio(sel, 'top3') }
  }
  const ms = rows.map(r => r.ms)
  return {
    rows,
    summary: { n: rows.length, top1: ratio(rows, 'top1'), top3: ratio(rows, 'top3'), byShape, p50Ms: pct(ms, 50), p95Ms: pct(ms, 95) },
  }
}
