import type { Screen } from '../core/types'

// T-304: a phone-side log of Step 2/3 hint episodes, built only from the screen
// stream the shell exposes plus the optional debug transcripts. A `candidates`
// screen opens an episode; follow-up candidates (browse/escalate) update it; any
// other screen closes it. A final transcript matching a suggested word within
// `heardWindowMs` marks the episode "helped" — without the debug source the log
// still records that the hint fired, and outcomes stay "cleared".

export interface HintEntry {
  /** When the hint episode's first candidates screen arrived (wall clock). */
  at: number
  /** When the episode closed (undefined while open). */
  endedAt?: number
  /** Words the user was shown (top suggestion first). */
  words: string[]
  /** Highest cue level shown during the episode. */
  level: number
  /** The suggestion visible when the episode ended (or latest, while open). */
  word: string
  outcome: 'open' | 'helped' | 'cleared'
}

export interface HintLog {
  feed(screen: Screen, at?: number): void
  feedTranscript(text: string, isFinal: boolean, at?: number): void
  /** Newest first; open episode is entries()[0] while open. */
  entries(): HintEntry[]
}

export function createHintLog(options: { max?: number; heardWindowMs?: number } = {}): HintLog {
  const max = options.max ?? 50
  const heardWindowMs = options.heardWindowMs ?? 8000
  const list: HintEntry[] = []
  let open: HintEntry | null = null

  const push = (entry: HintEntry) => {
    list.unshift(entry)
    if (list.length > max) list.length = max
  }

  return {
    feed(screen, at = Date.now()) {
      if (screen.kind === 'candidates') {
        const words = screen.items.map(item => item.word)
        const shown = screen.items[screen.index]
        if (open) {
          for (const word of words) if (!open.words.includes(word)) open.words.push(word)
          open.level = Math.max(open.level, screen.level)
          if (shown) open.word = shown.word
        } else {
          open = { at, words: [...words], level: screen.level, word: shown?.word ?? '', outcome: 'open' }
          push(open)
        }
        return
      }
      if (open) {
        if (open.outcome === 'open') open.outcome = 'cleared'
        open.endedAt = at
        open = null
      }
    },
    feedTranscript(text, isFinal, at = Date.now()) {
      if (!isFinal) return
      const said = text.toLowerCase()
      // Mark the newest episode whose suggestions include a heard word —
      // still open, or cleared within the hearing window (the screen cleared
      // because the user found the word).
      for (const entry of list) {
        if (entry.outcome === 'helped') continue
        if (entry.outcome === 'cleared' && at - (entry.endedAt ?? entry.at) > heardWindowMs) break
        if (entry.words.some(word => word && said.includes(word.toLowerCase()))) {
          entry.outcome = 'helped'
          break
        }
      }
    },
    entries() {
      return list.map(entry => ({ ...entry, words: [...entry.words] }))
    },
  }
}
