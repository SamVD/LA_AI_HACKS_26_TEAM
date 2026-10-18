/** Letters-first candidates (CONTRACT v3, Steps 2-3). Mirrors `docs/CONTRACTS.md`. */

export function spaceGlyphs(masked: string): string {
  return [...masked].join(' ')
}

function letterCount(text: string): number {
  return [...text].filter(ch => ch !== ' ').length
}

/** Reveal the first `revealLetterCount` letters; spaces stay visible; other letters become `_`. */
function maskPreservingSpaces(text: string, revealLetterCount: number): string {
  let letterIdx = 0
  let masked = ''
  for (const ch of text) {
    if (ch === ' ') masked += ' '
    else {
      masked += letterIdx < revealLetterCount ? ch : '_'
      letterIdx++
    }
  }
  return spaceGlyphs(masked)
}

/** First letter + one blank per remaining letter, e.g. `sunny` → `s _ _ _ _`. */
export function candidateLevel1(word: string): string {
  if (letterCount(word) === 0) return ''
  return maskPreservingSpaces(word, 1)
}

/** First ⌈n/2⌉ letters, then blanks, e.g. `sunny` → `s u n _ _`. */
export function candidateLevel2(word: string): string {
  const n = letterCount(word)
  if (n === 0) return ''
  return maskPreservingSpaces(word, Math.ceil(n / 2))
}

export function candidateDisplay(word: string, level: 1 | 2 | 3): string {
  if (level === 3) return word
  if (level === 2) return candidateLevel2(word)
  return candidateLevel1(word)
}
