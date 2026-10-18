// The cue ladder shared by Steps 1-3: level 1 = visual, 2 = letters, 3 = the
// full word. No SDK imports, so modes may use it directly.
import type { CueLevel, Screen, Suggestion } from '../core/types'

/** Step 1's partial word: first and last letter kept, e.g. `cup` -> `c_p`, `milk` -> `m__k`. */
export function maskWord(word: string): string {
  const letters = [...word]
  if (letters.length <= 2) return letters[0] + '_'.repeat(letters.length - 1)
  return letters[0] + '_'.repeat(letters.length - 2) + letters[letters.length - 1]
}

const LETTER = /[\p{L}\p{N}]/u
const WORD_GAP = '   '

/**
 * Steps 2-3 `candidates` text (CONTRACT_VERSION 3, D18): the first `level`-dependent
 * letters, the rest as blanks, one space between characters so each blank reads as
 * one letter. Level 1 = first letter (`s _ _ _ _`), 2 = first ⌈n/2⌉ letters
 * (`s u n _ _`), 3 = the word as written. Letters are counted across the whole
 * suggestion; spaces between words stay visible as a wider gap, and punctuation
 * (`'`, `-`) is always shown. Case is kept, so names keep their capital.
 */
export function revealWord(word: string, level: CueLevel): string {
  const trimmed = word.trim().replace(/\s+/g, ' ')
  if (level === 3) return trimmed
  const total = [...trimmed].filter(ch => LETTER.test(ch)).length
  const show = level === 1 ? 1 : Math.ceil(total / 2)
  let shown = 0
  return trimmed.split(' ').map(part => [...part].map(ch => {
    if (!LETTER.test(ch)) return ch
    return shown++ < show ? ch : '_'
  }).join(' ')).join(WORD_GAP)
}

export class CueLadder {
  private current: CueLevel = 1

  get level(): CueLevel { return this.current }

  /** Next level, stopping at 3. Returns the new level. */
  escalate(): CueLevel {
    if (this.current < 3) this.current = (this.current + 1) as CueLevel
    return this.current
  }

  get atTop(): boolean { return this.current === 3 }

  reset(): void { this.current = 1 }

  /** Step 1 cue Screen for `word` at the current level. */
  cue(word: string, opts: { sentence?: string; imageKey?: string; mouthKey?: string } = {}): Screen {
    return {
      kind: 'cue',
      level: this.current,
      word,
      ...(opts.imageKey ? { imageKey: opts.imageKey } : {}),
      ...(opts.mouthKey ? { mouthKey: opts.mouthKey } : {}),
      ...(this.current === 2 ? { masked: maskWord(word) } : {}),
      ...(opts.sentence ? { sentence: opts.sentence } : {}),
    }
  }

  /** Steps 2-3 candidates Screen for `items[index]` at the current level. */
  candidates(items: Suggestion[], index: number): Screen {
    return { kind: 'candidates', items, index, level: this.current }
  }
}
