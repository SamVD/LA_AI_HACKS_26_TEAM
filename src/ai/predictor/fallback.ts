import type { Suggestion, WordEntry } from '../../core/types'
import { clampN, MAX_TAIL_WORDS, PERSONAL } from './input'
import { type AssetResolver, withAssets } from './validate'

// docs/PREDICTOR_PROMPT.md Section 7 (prompt version 1), implemented as written.
// S-2 proposed changes (R0-R3 in spikes/predictor/FINDINGS.md) are pending an
// ORCH decision; each rule below is one line so it can be swapped cheaply.

export const RECENT_MS = 5 * 60_000
const FAMILY = /\bmy (daughter|son|wife|husband|friend|doctor|nurse)\b/
const CALL = /\b(call|see|talk to)\b/
const MEDICATION = /\b(take|took|my pills?)\b/
const PLACE = /\b(to the|at the|go to)\b/

/** Words the predictor showed, most recent last. Keys are lowercase words. */
export type SuggestionHistory = Map<string, number>

export const tokens = (s: string) =>
  s.toLocaleLowerCase('en').normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ').split(/\s+/).filter(Boolean)

export function scoreEntry(
  e: WordEntry,
  ctx: { tail: string; tailTokens: Set<string>; after: string; place: Set<string>; recent: (word: string) => boolean },
): number {
  let score = 0
  // tags may be multi-word ("blood pressure"): match them as whole-token phrases; `sample` is metadata
  for (const tag of e.tags) if (tag !== 'sample' && ctx.tail.includes(` ${tokens(tag).join(' ')} `)) score += 1
  for (const t of tokens(e.word)) if (ctx.tailTokens.has(t)) score += 1
  if (e.category === 'medication' && MEDICATION.test(ctx.after)) score += 0.5
  if (e.category === 'person' && (FAMILY.test(ctx.after) || CALL.test(ctx.after))) score += 0.5
  if (e.category === 'place' && PLACE.test(ctx.after)) score += 0.5
  if (ctx.tail.includes(` ${tokens(e.word).join(' ')} `) || ctx.recent(e.word)) score += 0.5
  if (e.tags.some(tag => ctx.place.has(tag))) score += 0.25
  return score
}

export function rankFallback(
  req: { transcriptTail: string; stalledAfter: string; bank: WordEntry[]; place?: { label?: string }; n: number },
  history: SuggestionHistory = new Map(),
  now = Date.now(),
  resolve?: AssetResolver,
): Suggestion[] {
  const n = clampN(req.n)
  const tailList = tokens(req.transcriptTail).slice(-MAX_TAIL_WORDS)
  const ctx = {
    tail: ` ${tailList.join(' ')} `,
    tailTokens: new Set(tailList),
    after: tokens(req.stalledAfter).join(' '),
    place: new Set(tokens(req.place?.label ?? '')),
    recent: (word: string) => now - (history.get(word.toLocaleLowerCase('en')) ?? -Infinity) <= RECENT_MS,
  }
  const scored = req.bank
    .map((entry, order) => ({ entry, order, score: scoreEntry(entry, ctx) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
  if (scored.length) {
    return scored.slice(0, n).map(({ entry, score }) =>
      withAssets({ word: entry.word, confidence: Math.min(0.6, 0.15 * score), source: 'bank' }, entry, resolve))
  }
  // Nothing scored: the most recently suggested personal entries, then the rest of them in bank order.
  const personal = req.bank.filter(e => PERSONAL.has(e.category))
  const lastUsed = (e: WordEntry) => history.get(e.word.toLocaleLowerCase('en')) ?? -Infinity
  return personal
    .map((entry, order) => ({ entry, order }))
    .sort((a, b) => lastUsed(b.entry) - lastUsed(a.entry) || a.order - b.order)
    .slice(0, n)
    .map(({ entry }) => withAssets({ word: entry.word, confidence: 0.05, source: 'bank' }, entry, resolve))
}
