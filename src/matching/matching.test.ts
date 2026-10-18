import { describe, expect, it } from 'vitest'
import { matchWord, type Strictness } from './index'

const cases: Array<[string, string, Strictness, boolean]> = [
  ['cup', 'cup', 0, true], ['CUP!', 'cup', 2, true],
  [' cop ', 'cup', 0, true], ['cop', 'cup', 1, false], ['cop', 'cup', 2, false],
  ['cup uh', 'cup', 0, true], ['cup uh', 'cup', 1, true], ['cup uh', 'cup', 2, false],
  ['cat', 'cat', 2, true], ['cap', 'cat', 0, false], ['cap', 'cat', 1, false], ['cap', 'cat', 2, false],
  ['please pass the cup', 'cup', 1, true], ['cupboard', 'cup', 0, false],
  ['sculpture', 'cup', 0, false], ['up', 'cup', 0, false], ['cupp', 'cup', 0, true],
  ['a', 'a', 0, true], ['I', 'a', 0, false], ['at', 'cat', 0, false],
  ['in', 'on', 0, false], ['an', 'an', 2, true],
  ['spoon', 'spoon', 2, true], ['spoo', 'spoon', 1, false], ['spoo', 'spoon', 0, true],
  ['spoun', 'spoon', 1, true], ['spoom', 'spoon', 1, true],
  ['fork', 'spoon', 0, false], ['form', 'fork', 0, true], ['form', 'fork', 1, false],
  ['phone', 'fone', 0, true], ['phone', 'fone', 1, false],
  ['nife', 'knife', 1, true], ['rite', 'write', 1, true], ['nite', 'night', 0, false],
  ['water', 'water', 2, true], ['watre', 'water', 0, true], ['waterr', 'water', 1, true],
  ['metformn', 'metformin', 1, true], ['lisnopril', 'lisinopril', 1, true],
  ['pharmcy', 'pharmacy', 1, true], ['pharmacy', 'park', 0, false],
  ['I need my keys.', 'keys', 1, true], ['key', 'keys', 1, false],
  ['I said Maya', 'Maya', 1, true], ['maya', 'Maya', 2, true],
  ['Dr. Velrin!', 'Dr Velrin', 2, true], ["It's Pip", "its pip", 2, true],
  ['CAFÉ', 'cafe', 2, true], ['ice-cream', 'ice cream', 2, true],
  ['please bring ice cream now', 'ice cream', 1, true], ['cream', 'ice cream', 0, false],
  ['cream ice', 'ice cream', 0, false], ['grocery store', 'grocery store', 2, true],
  ['please go to the grocery store', 'grocery store', 1, true],
  ['Sunrise Clinc', 'Sunrise Clinic', 1, true], ['Maple Hall', 'Sunrise Clinic', 0, false],
  ['', 'cup', 0, false], ['um', '', 0, false], ['...', 'cup', 0, false], ['cup', '!!!', 2, false],
  ['coffee', 'tea', 0, false], ['banana', 'apple', 1, false],
  ['teeth', 'toothbrush', 0, false], ['toothbrsh', 'toothbrush', 1, true],
  ['hello\nworld', 'hello world', 2, true], ['  cup \t ', 'cup', 2, true],
]

describe('word matcher', () => {
  it.each(cases)('%j for %j at strictness %i => %s', (heard, target, strictness, ok) => {
    const result = matchWord(heard, target, strictness)
    expect(result.ok).toBe(ok)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(1)
  })
  it('returns the normalized full transcript and preserves inputs', () => {
    const transcript = 'Please, pass the CUP!'
    expect(matchWord(transcript, 'cup', 1)).toEqual({ ok: true, score: 0.95, heard: 'please pass the cup' })
    expect(transcript).toBe('Please, pass the CUP!')
    expect(matchWord('CUP!', 'cup', 2)).toEqual({ ok: true, score: 1, heard: 'cup' })
  })
  it('does not produce NaN for empty/short inputs', () => {
    for (const target of ['', '.', 'a', 'cup']) {
      for (const heard of ['', '.', 'i', 'no']) {
        for (const strictness of [0, 1, 2] as const) expect(Number.isFinite(matchWord(heard, target, strictness).score)).toBe(true)
      }
    }
  })
})
