import type { PredictRequest, WordCategory, WordEntry } from '../../core/types'

// docs/PREDICTOR_PROMPT.md Section 4. The client trims and slims the request
// before POSTing it to api/predict (T-203), which appends [STALL] and builds
// the model's user turn. Keeping both steps in one place keeps them in sync.

export const PERSONAL = new Set<WordCategory>(['person', 'place', 'medication'])
export const MAX_BANK = 150
export const MAX_TAIL_WORDS = 40
export const MAX_TAIL_CHARS = 300

export type WireBankEntry = Pick<WordEntry, 'word' | 'category' | 'tags'>

/** What the client sends to api/predict. Same fields as PredictRequest, minus raw lat/lon and Step 1 frames. */
export interface PredictWireRequest {
  transcriptTail: string
  stalledAfter: string
  bank: WireBankEntry[]
  place?: { label: string }
  n: number
}

/** The model's user turn (Section 4), as T-203 sends it. */
export interface ModelInput {
  transcript: string
  stalledAfter: string
  bank: WireBankEntry[]
  place?: string
  n: number
}

export const clampN = (n: number) => Math.min(5, Math.max(1, Number.isFinite(n) ? Math.floor(n) : 3))

/** At most 40 words / 300 characters, cut from the front at a word boundary. */
export function trimTail(text: string): string {
  let words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length > MAX_TAIL_WORDS) words = words.slice(-MAX_TAIL_WORDS)
  while (words.length > 1 && words.join(' ').length > MAX_TAIL_CHARS) words = words.slice(1)
  return words.join(' ')
}

/** Personal entries first, capped at 150, reduced to {word, category, tags}. */
export function orderBank(bank: WordEntry[]): WireBankEntry[] {
  return [...bank.filter(e => PERSONAL.has(e.category)), ...bank.filter(e => !PERSONAL.has(e.category))]
    .slice(0, MAX_BANK)
    .map(({ word, category, tags }) => ({ word, category, tags: [...tags] }))
}

export function toWireRequest(r: PredictRequest): PredictWireRequest {
  const wire: PredictWireRequest = {
    transcriptTail: trimTail(r.transcriptTail),
    stalledAfter: r.stalledAfter.trim(),
    bank: orderBank(r.bank),
    n: clampN(r.n),
  }
  if (r.place?.label) wire.place = { label: r.place.label }
  return wire
}

export function buildModelInput(r: PredictWireRequest): ModelInput {
  return {
    transcript: `${trimTail(r.transcriptTail)} [STALL]`,
    stalledAfter: r.stalledAfter.trim(),
    bank: r.bank.slice(0, MAX_BANK),
    ...(r.place?.label ? { place: r.place.label } : {}),
    n: clampN(r.n),
  }
}
