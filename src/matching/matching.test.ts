import { describe, expect, it } from 'vitest'
import { editDistance, matchWord, normalize, phoneticCode, type Strictness } from './index'

const cases: Array<[string, string, Strictness, boolean]> = []
for (const strictness of [0, 1, 2] as const) {
  for (const heard of ['cup', 'CUP!', 'the cup', 'cup uh', 'um cup', 'cups', "it's a cup"]) {
    cases.push([heard, 'cup', strictness, true])
  }
  cases.push(['cop', 'cup', strictness, strictness === 0],
    ['cap', 'cat', strictness, strictness === 0],
    ['spoom', 'spoon', strictness, strictness !== 2],
    ['nana', 'banana', strictness, false],
    ['I want ice cream', 'ice cream', strictness, true],
    ['doctor velrin', 'Dr. Velrin', strictness, true],
    ['spoon', 'fork', strictness, false],
    ['cupboard', 'cup', strictness, false],
    ['', 'cup', strictness, false],
    ['cream', 'ice cream', strictness, false],
    ['glasses', 'glass', strictness, true],
    ['I want ice uh cream', 'ice cream', strictness, true])
}
cases.push(['nife', 'knife', 1, true], ['fone', 'phone', 1, true],
  ['form', 'fork', 1, false], ['form', 'fork', 0, true],
  ['spoom', 'spoon', 2, false], ['lisnopril', 'lisinopril', 1, true],
  ['Sunrise Clinc', 'Sunrise Clinic', 1, true], ['Maple Hall', 'Sunrise Clinic', 0, false],
  ['coffee', 'tea', 0, false], ['banana', 'apple', 1, false],
  ['teeth', 'toothbrush', 0, false], ['CAFÉ', 'cafe', 2, true],
  ['ice-cream', 'ice cream', 2, true], ['like', 'like', 2, true])

describe('word matcher', () => {
  it.each(cases)('%j for %j at strictness %i => %s', (heard, target, strictness, ok) => {
    const result = matchWord(heard, target, strictness)
    expect(result.ok).toBe(ok)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(1)
  })
  it('returns the best matching n-gram and preserves input', () => {
    const transcript = 'Please, pass the CUP!'
    expect(matchWord(transcript, 'cup', 1)).toEqual({ ok: true, score: 1, heard: 'cup' })
    expect(matchWord('spoom uh spoon', 'spoon', 1).heard).toBe('spoon')
    expect(matchWord('bring ice cream now', 'ice cream', 2).heard).toBe('ice cream')
    expect(transcript).toBe('Please, pass the CUP!')
  })
  it('normalizes punctuation, names, whitespace and apostrophes', () => {
    expect(normalize("  Dr. Velrin's ice-cream!  ")).toBe("doctor velrin's ice cream")
    expect(normalize("'It's'  Pip’s." )).toBe("it's pip's")
  })
  it.each([['knife', 'nife'], ['gnome', 'nome'], ['pneumatic', 'neumatic'],
    ['phone', 'fone'], ['city', 'sity'], ['gem', 'jem'], ['ship', 'chip'],
    ['thick', 'thik'], ['back', 'bak']])('codes %s and %s consistently', (a, b) => {
    expect(phoneticCode(a)).toBe(phoneticCode(b))
  })
  it('computes Levenshtein distance including empty and Unicode strings', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3)
    expect(editDistance('', 'cup')).toBe(3)
    expect(editDistance('🐈', '🐕')).toBe(1)
  })
  it('has finite scores for empty/short inputs', () => {
    for (const target of ['', '.', 'a', 'cup']) {
      for (const heard of ['', '.', 'i', 'no']) {
        for (const strictness of [0, 1, 2] as const) expect(Number.isFinite(matchWord(heard, target, strictness).score)).toBe(true)
      }
    }
  })
})
