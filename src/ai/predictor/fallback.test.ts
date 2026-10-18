import { describe, expect, it } from 'vitest'
import type { PredictRequest, WordEntry } from '../../core/types'
import words from '../../content/words.json'
import { rankFallback } from './fallback'

const bank = words as WordEntry[]
const req = (transcriptTail: string, entries = bank): PredictRequest =>
  ({ transcriptTail, stalledAfter: 'the', bank: entries, n: 5 })
const names = (request: PredictRequest, history = new Map<string, number>(), now = 0) =>
  rankFallback(request, history, now).map(s => s.word)

describe('fallback v2 (R0-R4)', () => {
  it.each([
    'The soup is too hot to drink. Bring a fork, no, not a fork, the',
    'Not a fork',
  ])('does not repeat a just-said/rejected fork: %s', text => {
    expect(names(req(text), new Map([['fork', 0]]))).not.toContain('fork')
  })

  it.each(['I have tea to drink from a', 'The tea is ready, pour my tea into the'])('%s ranks cup above tea', text => {
    const result = names(req(text))
    expect(result[0]).toBe('cup')
    const tea = result.indexOf('tea')
    expect(tea === -1 || tea > result.indexOf('cup')).toBe(true)
  })

  it('does not boost old non-name mentions; names recur, as whole phrases', () => {
    const entries = bank.filter(e => ['cup', 'p-maya', 'p-dr-velrin'].includes(e.id))
    const result = rankFallback(req('cup Maya Dr. Velrin one two three four five six seven eight nine', entries))
    expect(result.map(s => s.word)).toEqual(['Maya', 'Dr. Velrin'])
    expect(result.map(s => s.confidence)).toEqual([0.075, 0.075])
    expect(names(req('Velrin', entries))).not.toContain('Dr. Velrin')
  })

  it('boosts lisi → lisinopril; excludes stop words and whole words from prefix boosts', () => {
    expect(names(req('lisi'))[0]).toBe('lisinopril')
    expect(names(req('the and with'))).toEqual([])
    expect(names(req('lisinopril'))).not.toContain('lisinopril')
    const unrelated: WordEntry = { id: 'b', word: 'butter', category: 'food', tags: [], frames: [] }
    expect(names(req('but', [unrelated]))).toEqual([])
  })

  it.each([
    ['I need to take, uh, my', 'lisinopril'],
    ['my um daughter er', 'Maya'],
    ['we should talk uh to', 'Maya'],
    ['go um to the', 'kitchen'],
    ['pill erm', 'metformin'],
  ])('uses recent category cues through fillers: %s', (text, word) => {
    expect(names(req(text))).toContain(word)
  })

  it('limits category/prefix cues to the last 8 non-filler words', () => {
    expect(names(req('take lisi one two three four five six seven eight nine'))).toEqual([])
  })

  it('ignores metadata and normalizes tag/place spelling', () => {
    const entry: WordEntry = { id: 'x', word: 'testword', category: 'other', frames: [], tags: ['Sample', 'PERSONAL'] }
    const request = { ...req('sample personal', [entry]), place: { lat: 0, lon: 0, label: 'sample personal' } }
    expect(names(request)).toEqual([])
    expect(rankFallback({ ...req('unrelated', [{ ...entry, tags: ['Kitchen'] }]), place: { label: 'kitchen' } })[0].confidence).toBe(0.0375)
  })

  it('does not count substring tag matches or future suggestion history', () => {
    const entry: WordEntry = { id: 'x', word: 'testword', category: 'other', frames: [], tags: ['tea'] }
    expect(names(req('teapot', [entry]))).toEqual([])
    expect(names(req('unrelated', [entry]), new Map([['testword', 10]]), 0)).toEqual([])
  })
})
