// Regenerates api/predict/_prompt.ts from docs/PREDICTOR_PROMPT.md (ORCH owns the doc).
//   node api/predict/_gen-prompt.mjs
// _prompt.test.ts fails CI whenever the two disagree, so run this after every prompt version bump.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const doc = readFileSync(join(ROOT, 'docs', 'PREDICTOR_PROMPT.md'), 'utf8')
const section = n => doc.split(/^## /m).find(s => s.startsWith(`${n}. `)) ?? ''
const fences = (s, lang) => [...s.matchAll(new RegExp('```' + lang + '\\n([\\s\\S]*?)```', 'g'))].map(m => m[1].trim())

const version = Number(doc.match(/\*\*Prompt version: (\d+)\.\*\*/)?.[1])
const system = fences(section(3), 'text')[0]
const schema = JSON.parse(fences(section(5), 'json')[0])
const examples = section(8).split(/^### /m).slice(1).map(s => {
  const [input, output] = fences(s, 'json')
  return { input: JSON.parse(input), output: JSON.parse(output) }
})
if (!version || !system || examples.length !== 7) throw new Error(`doc parse failed (version ${version}, examples ${examples.length})`)

const out = `// Generated from docs/PREDICTOR_PROMPT.md (prompt version ${version}). Do not edit by hand:
// _prompt.test.ts fails if this drifts from the doc. To update, change the doc (ORCH),
// then regenerate: node api/predict/_gen-prompt.mjs

export const PROMPT_VERSION = ${version}

/** Section 3, verbatim. */
export const SYSTEM_PROMPT = ${JSON.stringify(system)}

/** Section 5. */
export const RESPONSE_SCHEMA = ${JSON.stringify(schema, null, 2)}

/** Section 8, Examples 1-7, sent as few-shot turns (Section 2). */
export const EXAMPLES: ReadonlyArray<{ input: unknown; output: unknown }> = ${JSON.stringify(examples, null, 2)}
`
writeFileSync(join(ROOT, 'api', 'predict', '_prompt.ts'), out)
console.log(`api/predict/_prompt.ts: prompt version ${version}, ${examples.length} examples`)
