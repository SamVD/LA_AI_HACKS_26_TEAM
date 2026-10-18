import type { WordCategory, WordEntry } from '../core/types'

const personalCategories = new Set<WordCategory>(['person', 'medication', 'place', 'other'])

export const PRACTICE_FRAME_MAX_LEN = 55

export function isPersonalCategory(category: WordCategory): boolean {
  return personalCategories.has(category)
}

/** Base slug for display words; may be empty for non-Latin scripts. */
export function slugPersonalBase(word: string): string {
  return word
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function slugPersonalId(word: string): string {
  const slug = slugPersonalBase(word)
  return `p-${slug || 'word'}`
}

export type PracticeFrameResult =
  | { ok: true; frame: string }
  | { ok: false; reason: string }

/** Same rules as `fixtures/fixtures.test.ts` for `words.json` frames. */
export function validatePracticeFrame(raw: string): PracticeFrameResult {
  const frame = raw.trim()
  if (!frame) return { ok: false, reason: 'Practice sentence cannot be empty.' }
  if (frame.length > PRACTICE_FRAME_MAX_LEN) {
    return { ok: false, reason: `Use at most ${PRACTICE_FRAME_MAX_LEN} characters.` }
  }
  const blanks = frame.match(/____/g)
  if (!blanks || blanks.length !== 1) {
    return { ok: false, reason: 'Include exactly one blank: ____' }
  }
  if (frame.includes('_____')) {
    return { ok: false, reason: 'Use four underscores for the blank: ____' }
  }
  return { ok: true, frame }
}

/** Avoid overwriting builtin or user entries when ids collide. */
export function allocatePersonalId(word: string, takenIds: ReadonlySet<string>): string {
  const slug = slugPersonalBase(word)
  const stem = slug || 'word'
  let candidate = `p-${stem}`
  if (!takenIds.has(candidate)) return candidate
  let n = 2
  while (takenIds.has(`${candidate}-${n}`)) n += 1
  return `${candidate}-${n}`
}

export function buildPersonalEntry(
  word: string,
  category: WordCategory,
  tags: string[],
  options: { practiceFrame?: string; takenIds: ReadonlySet<string> },
): WordEntry {
  const trimmed = word.trim()
  const frames: string[] = []
  if (options.practiceFrame) {
    const checked = validatePracticeFrame(options.practiceFrame)
    if (!checked.ok) throw new Error(checked.reason)
    frames.push(checked.frame)
  }
  return {
    id: allocatePersonalId(trimmed, options.takenIds),
    word: trimmed,
    category,
    frames,
    tags: tags.length ? tags : ['personal'],
  }
}
