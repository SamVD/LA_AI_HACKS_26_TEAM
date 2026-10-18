import { describe, expect, it } from 'vitest'
import type { Transcript, WordEntry } from '../../core/types'
import words from '../../content/words.json'
import { extractKeywords } from './index'

const bank = words as WordEntry[]
const final = (text: string, tEndMs = 1000, tStartMs = tEndMs - 500): Transcript =>
  ({ text, isFinal: true, tStartMs, tEndMs })
const terms = (items: ReturnType<typeof extractKeywords>) => items.map(item => item.word)
const fixtures = import.meta.glob<{ events: Array<{
  type: string; text?: string; isFinal?: boolean; tStartMs?: number; tMs: number
}> }>('../../../fixtures/conversations/*.json', { eager: true, import: 'default' })

describe('fixture keyword extraction', () => {
  it.each([
    ['appointment-pause', ['water', 'appointment', 'door']],
    ['breakfast-stalls', ['eggs', 'bread', 'kitchen']],
    ['circumlocution', ['knife', 'bread', 'sandwiches']],
    ['clean-stall', ['tea', 'cup', 'keys']],
    ['filler-stall', ['lisinopril', 'water', 'bottle']],
    ['known-name', ['Maya', 'park', 'sandwiches']],
    ['near-miss-sound', ['cup', 'tea', 'shoes']],
    ['near-synonym-1', ['cup', 'tea', 'teapot']],
    ['near-synonym-2', ['spoon', 'soup', 'bread']],
    ['no-stall', ['water', 'garden', 'weather']],
    ['not-in-bank', ['mechanic', 'garage', 'car']],
  ])('%s extracts words actually mentioned', (id, expected) => {
    const fixture = fixtures[`../../../fixtures/conversations/${id}.json`]
    expect(fixture).toBeDefined()
    const transcripts = fixture.events.filter(e => e.type === 'transcript').map(e => ({
      text: e.text!, isFinal: e.isFinal!, tStartMs: e.tStartMs!, tEndMs: e.tMs,
    }))
    const result = extractKeywords(transcripts, bank, { n: 100 })
    expect(terms(result)).toEqual(expect.arrayContaining(expected))
    expect(extractKeywords([...transcripts].reverse(), bank, { n: 100 })).toEqual(result)
    expect(result.every(k => Number.isFinite(k.score) && k.score > 0)).toBe(true)
  })
})

describe('keyword ranking and boundaries', () => {
  it('uses bank spelling and categories, including medications and multiword places', () => {
    const result = extractKeywords([final('MAYA met Dr. Velrin at Sunrise Clinic with lisinopril.')], bank, { n: 20 })
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ word: 'Maya', kind: 'person', source: 'bank', bankId: 'p-maya' }),
      expect.objectContaining({ word: 'Dr. Velrin', kind: 'person' }),
      expect.objectContaining({ word: 'Sunrise Clinic', kind: 'place' }),
      expect.objectContaining({ word: 'lisinopril', kind: 'topic' }),
    ]))
    expect(terms(result)).not.toContain('clinic')
  })

  it('does not suggest unmentioned bank entries based on tags', () => {
    expect(terms(extractKeywords([final('my daughter and her appointment')], bank))).not.toContain('Maya')
  })

  it('matches accents, possessives, and hyphenated phrases without substring matches', () => {
    const custom: WordEntry[] = [
      { id: 'jose', word: 'José', category: 'person', frames: [], tags: [] },
      { id: 'hall', word: 'Maple Hall', category: 'place', frames: [], tags: [] },
      ...bank,
    ]
    const result = terms(extractKeywords([final('JOSE’S visit to Maple-Hall. A cupcake and teaspoon.')], custom, { n: 20 }))
    expect(result).toContain('José')
    expect(result).toContain('Maple Hall')
    expect(result).not.toContain('cup')
    expect(result).not.toContain('spoon')
  })

  it('does not match multiword entries across sentence boundaries', () => {
    const result = extractKeywords([final('We saw the sunrise. Clinic doors opened.')], bank, { n: 20 })
    expect(terms(result)).not.toContain('Sunrise Clinic')
  })

  it('prefers the longest bank phrase and resolves duplicate words deterministically', () => {
    const custom: WordEntry[] = [
      { id: 'b', word: 'Hall', category: 'person', frames: [], tags: [] },
      { id: 'z', word: 'Maple Hall', category: 'place', frames: [], tags: [] },
      { id: 'a', word: 'Maple Hall', category: 'place', frames: [], tags: [] },
    ]
    const result = extractKeywords([final('Maple Hall')], custom)
    expect(result).toHaveLength(1)
    expect(result[0].bankId).toBe('a')
    expect(extractKeywords([final('Maple Hall')], [...custom].reverse())).toEqual(result)
  })

  it('uses contextual rules for unknown names and places and filters fillers', () => {
    const result = extractKeywords([final('Um, I met Elena Ruiz at Cedar Hospital. We discussed gardening.')], [], { n: 20 })
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ word: 'Elena Ruiz', kind: 'person', source: 'rules' }),
      expect.objectContaining({ word: 'Cedar Hospital', kind: 'place', source: 'rules' }),
      expect.objectContaining({ word: 'gardening', kind: 'topic' }),
    ]))
    for (const filler of ['um', 'met', 'we']) expect(terms(result)).not.toContain(filler)
    expect(extractKeywords([final('Um, well, I would like to, uh, go there please.')], [])).toEqual([])
  })

  it('does not infer a person solely from sentence capitalization', () => {
    expect(extractKeywords([final('Gardening helps.')], []).every(k => k.kind === 'topic')).toBe(true)
    expect(extractKeywords([final('We met. Gardening helps.')], []).every(k => k.kind === 'topic')).toBe(true)
  })

  it('halves scores per half-life, favors recent mentions, and expires old words', () => {
    const transcripts = [final('Maya', 1000), final('Nilo', 61_000)]
    const result = extractKeywords(transcripts, bank, { nowMs: 61_000, halfLifeMs: 60_000 })
    expect(terms(result)).toEqual(['Nilo', 'Maya'])
    expect(result[1].score).toBe(result[0].score / 2)
    expect(extractKeywords(transcripts, bank, { nowMs: 400_000 })).toEqual([])
  })

  it('counts separate utterances but caps repeated mentions within one utterance', () => {
    const one = extractKeywords([final('Maya Maya Maya')], bank)[0]
    expect(one.score).toBe(3)
    expect(extractKeywords([final('Maya', 500), final('Maya', 1000)], bank)[0].score).toBeGreaterThan(3)
  })

  it('ignores interim results, errors, invalid times and future segments', () => {
    const invalid = [
      { ...final('Maya'), isFinal: false }, { ...final('Maya'), error: 'network' as const },
      final('Maya', NaN), final('Maya', 0, 1), final('Maya', 2000),
    ]
    expect(extractKeywords(invalid, bank, { nowMs: 1000 })).toEqual([])
  })

  it('deduplicates replayed finals and uses the latest correction for each utterance', () => {
    const transcripts = [final('Maya', 1000, 0), final('Nilo', 2000, 0)]
    const result = extractKeywords(transcripts, bank)
    expect(terms(result)).toEqual(['Nilo'])
    expect(extractKeywords([...transcripts, ...transcripts].reverse(), bank)).toEqual(result)
    expect(terms(extractKeywords(transcripts, bank, { nowMs: 1500 }))).toEqual(['Maya'])
  })

  it('has deterministic ties and top-N and does not mutate inputs', () => {
    const transcripts = [final('Nilo Maya')]
    const original = structuredClone({ transcripts, bank })
    expect(terms(extractKeywords(transcripts, bank))).toEqual(['Maya', 'Nilo'])
    expect(terms(extractKeywords(transcripts, bank, { n: 1.9 }))).toEqual(['Maya'])
    for (const n of [0, -1, NaN, Infinity]) expect(extractKeywords(transcripts, bank, { n })).toEqual([])
    expect({ transcripts, bank }).toEqual(original)
    expect(extractKeywords([], bank)).toEqual([])
    expect(extractKeywords(transcripts, bank, { nowMs: NaN })).toEqual([])
    expect(extractKeywords(transcripts, bank, { halfLifeMs: 0, maxAgeMs: -1 })).toEqual(extractKeywords(transcripts, bank))
  })
})
