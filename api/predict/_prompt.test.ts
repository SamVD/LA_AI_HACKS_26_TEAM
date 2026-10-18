/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import doc from '../../docs/PREDICTOR_PROMPT.md?raw'
import { EXAMPLES, PROMPT_VERSION, RESPONSE_SCHEMA, SYSTEM_PROMPT } from './_prompt'

// Drift guard: _prompt.ts is generated from docs/PREDICTOR_PROMPT.md. If ORCH changes the
// doc, this fails until someone runs `node api/predict/_gen-prompt.mjs`.
const section = (n: number) => doc.split(/^## /m).find(s => s.startsWith(`${n}. `)) ?? ''
const fences = (s: string, lang: string) => [...s.matchAll(new RegExp('```' + lang + '\\n([\\s\\S]*?)```', 'g'))].map(m => m[1].trim())

describe('api/predict prompt matches docs/PREDICTOR_PROMPT.md', () => {
  it('has the doc prompt version', () => {
    expect(PROMPT_VERSION).toBe(Number(doc.match(/\*\*Prompt version: (\d+)\.\*\*/)?.[1]))
  })

  it('has the Section 3 system prompt verbatim', () => {
    expect(SYSTEM_PROMPT).toBe(fences(section(3), 'text')[0])
  })

  it('has the Section 5 schema', () => {
    expect(RESPONSE_SCHEMA).toEqual(JSON.parse(fences(section(5), 'json')[0]))
  })

  it('has Examples 1-7 from Section 8', () => {
    const fromDoc = section(8).split(/^### /m).slice(1).map(s => {
      const [input, output] = fences(s, 'json')
      return { input: JSON.parse(input), output: JSON.parse(output) }
    })
    expect(fromDoc).toHaveLength(7)
    expect(EXAMPLES).toEqual(fromDoc)
  })
})
