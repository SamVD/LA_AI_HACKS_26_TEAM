import { describe, expect, it } from 'vitest'
import { candidateDisplay, candidateLevel1, candidateLevel2 } from './candidateLetters'

describe('candidateLetters (CONTRACT v3)', () => {
  it('formats L1 and L2 per the contract examples', () => {
    expect(candidateLevel1('sunny')).toBe('s _ _ _ _')
    expect(candidateLevel2('sunny')).toBe('s u n _ _')
    expect(candidateLevel1('cup')).toBe('c _ _')
    expect(candidateLevel2('cup')).toBe('c u _')
  })

  it('shows the full word at L3', () => {
    expect(candidateDisplay('sunny', 3)).toBe('sunny')
  })
})
