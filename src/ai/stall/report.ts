// T-301 precision/recall report over fixtures/conversations (T-007).
//   npx vite-node src/ai/stall/report.ts                 # default config
//   npx vite-node src/ai/stall/report.ts --content-words # also hint after content-word endings
//   npx vite-node src/ai/stall/report.ts --min 1200      # try another silence threshold
// Not imported by the app.
/// <reference types="vite/client" />
import type { ConversationFixture } from '../../mocks/fixtures'
import { DEFAULT_STALL_CONFIG, type StallConfig } from './detector'
import { evaluate, VARIANTS } from './evaluate'

const args = ((globalThis as { process?: { argv?: string[] } }).process?.argv ?? []).slice(2)
const num = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? Number(args[i + 1]) : undefined }
const config: Partial<StallConfig> = {
  ...(args.includes('--content-words') ? { contentWordEndings: true } : {}),
  ...(num('--min') !== undefined ? { minSilenceMs: num('--min') } : {}),
}

const fixtures = Object.entries(import.meta.glob<ConversationFixture>('../../../fixtures/conversations/*.json', { eager: true, import: 'default' }))
  .sort(([a], [b]) => a.localeCompare(b)).map(([, f]) => f)

console.log(`config: ${JSON.stringify({ ...DEFAULT_STALL_CONFIG, ...config })}`)
console.log(`${fixtures.length} conversations\n`)
const rows = VARIANTS.map(v => evaluate(fixtures, config, { variant: v }))
console.table(rows.map(r => ({
  variant: r.variant, stalls: r.stalls, 'normal pauses': r.normalPauses, TP: r.truePositives, FP: r.falsePositives,
  missed: r.misses, precision: r.precision, recall: r.recall, 'mean ms': r.meanLatencyMs, 'max ms': r.maxLatencyMs,
})))
for (const r of rows) {
  for (const g of r.falsePositiveGaps) console.log(`FALSE HINT [${r.variant}] ${g.fixture} @${g.startMs} ms after "${g.utterance}"`)
  for (const g of r.missedGaps) console.log(`missed     [${r.variant}] ${g.fixture} @${g.startMs} ms`)
}
