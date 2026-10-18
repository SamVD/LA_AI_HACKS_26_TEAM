/** Letters-first candidates (CONTRACT v3, Steps 2-3). Mirrors `docs/CONTRACTS.md`. */

export function spaceGlyphs(masked: string): string {
  return [...masked].join(' ')
}

/** First letter + one blank per remaining letter, e.g. `sunny` → `s _ _ _ _`. */
export function candidateLevel1(word: string): string {
  const letters = [...word]
  if (!letters.length) return ''
  return spaceGlyphs(letters[0] + '_'.repeat(Math.max(0, letters.length - 1)))
}

/** First ⌈n/2⌉ letters, then blanks, e.g. `sunny` → `s u n _ _`. */
export function candidateLevel2(word: string): string {
  const letters = [...word]
  if (!letters.length) return ''
  const fill = Math.ceil(letters.length / 2)
  const masked = letters.slice(0, fill).join('') + '_'.repeat(letters.length - fill)
  return spaceGlyphs(masked)
}

export function candidateDisplay(word: string, level: 1 | 2 | 3): string {
  if (level === 3) return word
  if (level === 2) return candidateLevel2(word)
  return candidateLevel1(word)
}
