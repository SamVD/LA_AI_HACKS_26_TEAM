// The cue ladder shared by Steps 1-3: level 1 = visual, 2 = letters, 3 = the
// full word. No SDK imports, so modes may use it directly.
import type { CueLevel, Screen, Suggestion } from '../core/types'

/** Step 1's partial word: first and last letter kept, e.g. `cup` -> `c_p`, `milk` -> `m__k`. */
export function maskWord(word: string): string {
  const letters = [...word]
  if (letters.length <= 2) return letters[0] + '_'.repeat(letters.length - 1)
  return letters[0] + '_'.repeat(letters.length - 2) + letters[letters.length - 1]
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
