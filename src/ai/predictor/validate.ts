import type { Suggestion, WordEntry } from '../../core/types'
import { clampN } from './input'

// docs/PREDICTOR_PROMPT.md Section 6. Rules run in order; a failing item is
// dropped and the rest continue. Zero survivors means the response is invalid.

export type AssetResolver = (entry: WordEntry) => { imageKey?: string; mouthKey?: string }

export const STOP_WORDS = new Set(
  'um uh er hmm the a an and or but with like it that this thing stuff something'.split(' '),
)
/**
 * G3 re-run (#120): words that are never the word someone is searching for: pronouns,
 * function words and conversational fillers ("me", "then", "Did you"). A model suggestion that
 * is one of these, or a phrase containing one (unless it's a word-bank entry), is dropped.
 */
export const FUNCTION_WORDS = new Set(`i me my mine myself you your yours we us our they them their he him his she her
  it its this that these those there here then than so to of in on at by for from into onto with without about
  is am are was were be been being do does did done have has had can could will would shall should may might must
  not no yes yeah yep ok okay oh ah well just really very too also please thanks thank sorry what who whom whose
  which where when why how if because as or and but nor um uh er erm hmm`.split(/\s+/))
const ABBREVIATION = /\b(dr|mr|mrs|ms|st|jr|sr)\.$/i
const ALLOWED = /^\p{L}[\p{L} .'’-]*$/u

export interface Validation {
  items: Suggestion[]
  dropped: number
  /** Set when the whole response is invalid. */
  invalid?: 'parse' | 'not-array' | 'empty'
}

const lower = (s: string) => s.toLocaleLowerCase('en')

/** Lowercase last word of `stalledAfter`, ignoring punctuation. */
export function lastWord(stalledAfter: string): string {
  return lower(stalledAfter).match(/[\p{L}'’]+/gu)?.pop() ?? ''
}

/** Key for duplicate detection: case-insensitive, and `cups` collapses onto `cup`. */
export const dedupeKey = (word: string) => lower(word).replace(/(?<=[^s])s$/, '')

/** Rule 3: trim, collapse spaces, strip surrounding punctuation/quotes and a leading article. */
export function cleanWord(raw: string): string {
  let w = raw.trim().replace(/\s+/g, ' ')
  const keepDot = ABBREVIATION.test(w)
  w = w.replace(/^[\s"'`“”‘’.,;:!?()[\]{}*_-]+/u, '').replace(/[\s"'`“”‘’,;:!?()[\]{}*_-]+$/u, '')
  if (!keepDot) w = w.replace(/\.+$/, '')
  return w.replace(/^(the|a|an)\s+/i, '').trim()
}

/** Turns a model word that is not in the bank into an entry so assets can still resolve. */
export function adHocEntry(word: string): WordEntry {
  const id = lower(word).normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return { id: id || 'word', word, category: 'other', frames: [], tags: [] }
}

export function withAssets(s: Omit<Suggestion, 'imageKey' | 'mouthKey'>, entry: WordEntry, resolve?: AssetResolver): Suggestion {
  const { imageKey, mouthKey } = resolve?.(entry) ?? {}
  return { ...s, ...(imageKey ? { imageKey } : {}), ...(mouthKey ? { mouthKey } : {}) }
}

export function validateModelOutput(
  raw: string,
  req: { stalledAfter: string; bank: WordEntry[]; n: number },
  resolve?: AssetResolver,
): Validation {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { items: [], dropped: 0, invalid: 'parse' }
  }
  if (!Array.isArray(parsed)) return { items: [], dropped: 0, invalid: 'not-array' }

  const last = lastWord(req.stalledAfter)
  const bankByWord = new Map(req.bank.map(e => [lower(e.word), e]))
  const kept = new Map<string, { word: string; confidence: number; entry?: WordEntry }>()
  let dropped = 0
  for (const item of parsed) {
    const word = (item as { word?: unknown })?.word
    const confidence = (item as { confidence?: unknown })?.confidence
    if (typeof word !== 'string' || typeof confidence !== 'number' || !Number.isFinite(confidence)) {
      dropped++
      continue
    }
    const w = cleanWord(word)
    if (w.length < 1 || w.length > 40 || w.split(' ').length > 3 || !ALLOWED.test(w)) {
      dropped++
      continue
    }
    if (STOP_WORDS.has(lower(w)) || lower(w) === last) {
      dropped++
      continue
    }
    const entry = bankByWord.get(lower(w))
    if (!entry && lower(w).split(/[\s-]+/).some(part => FUNCTION_WORDS.has(part.replace(/['’]s$/, '')))) {
      dropped++
      continue
    }
    const next = { word: entry ? entry.word : w, confidence: Math.min(1, Math.max(0, confidence)), entry }
    const key = dedupeKey(w)
    const prev = kept.get(key)
    if (prev) {
      dropped++
      if (next.confidence > prev.confidence) kept.set(key, next)
    } else {
      kept.set(key, next)
    }
  }

  const items = [...kept.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, clampN(req.n))
    .map(({ word, confidence, entry }) => withAssets(
      { word, confidence, source: entry ? 'bank' : 'model' },
      entry ?? adHocEntry(word),
      resolve,
    ))
  return items.length ? { items, dropped } : { items, dropped, invalid: 'empty' }
}
