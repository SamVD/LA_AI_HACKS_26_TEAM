import { describe, expect, it } from 'vitest'
import { junkReason } from './index'

describe('junkReason (G3 re-run, #120)', () => {
  const loud = { speechDb: -12, speechMs: 1200 }
  it('keeps normal English speech', () => {
    expect(junkReason('I have two, um', loud)).toBeNull()
    expect(junkReason('Café au lait', loud)).toBeNull()
    expect(junkReason('Maya', { speechDb: -12, speechMs: 300 })).toBeNull() // short but loud: the wearer
    expect(junkReason('Do you have any brothers or sisters?', { speechDb: -29, speechMs: 1800 })).toBeNull() // partner, long: context
  })
  it('drops mostly non-Latin text', () => {
    expect(junkReason('OK啊你好', loud)).toBe('non-latin')
    expect(junkReason('നമസ്കാരം', loud)).toBe('non-latin')
  })
  it('drops short and quiet fragments only when both hold', () => {
    expect(junkReason('to', { speechDb: -24, speechMs: 260 })).toBe('short-quiet')
    expect(junkReason('to', { speechDb: -24, speechMs: 600 })).toBeNull()
    expect(junkReason('to', { speechDb: -18, speechMs: 260 })).toBeNull()
    expect(junkReason('to', null)).toBeNull()
  })
})
