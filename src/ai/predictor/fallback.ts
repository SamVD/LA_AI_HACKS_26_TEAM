import type { Suggestion, WordEntry } from '../../core/types'
import { clampN, MAX_TAIL_WORDS } from './input'
import { type AssetResolver, withAssets } from './validate'

// docs/PREDICTOR_PROMPT.md Section 7, prompt version 2 (R0-R4).

export const RECENT_MS = 5 * 60_000
const FAMILY = /\bmy (daughter|son|wife|husband|friend|doctor|nurse)\b/
const CALL = /\b(call|see|talk to)\b/
const MEDICATION = /\b(take|took|pills?)\b/
const PLACE = /\b(to the|at the|go to)\b/
const FILLERS = new Set('um uh er erm hmm like'.split(' '))
const STOP = new Set(`um uh er erm hmm the a an and or but with like it that this thing stuff something
  i my me we our you your he she they them to from at in on of for is are was were be have has had
  do does did can could will would should not no yes please take took pill pills call see talk`.split(/\s+/))

/** Words the predictor showed, most recent last. Keys are lowercase words. */
export type SuggestionHistory = Map<string, number>

export const tokens = (s: string) =>
  s.toLocaleLowerCase('en').normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ').split(/\s+/).filter(Boolean)

export function scoreEntry(
  e: WordEntry,
  ctx: { tail: string; recentTail: string; recentTokens: string[]; place: Set<string>; recent: (word: string) => boolean },
): number {
  let score = 0
  // tags may be multi-word ("blood pressure"): match them as whole-token phrases; `sample` is metadata
  const tags = e.tags.map(tag => tokens(tag).join(' ')).filter(tag => tag && tag !== 'sample' && tag !== 'personal')
  for (const tag of new Set(tags)) if (ctx.tail.includes(` ${tag} `)) score += 1
  const word = tokens(e.word).join(' ')
  const justSaid = !!word && ctx.recentTail.includes(` ${word} `)
  if (word && ctx.tail.includes(` ${word} `)) {
    if (e.category === 'person') score += 0.5
    else if (justSaid) score -= 1
  }
  if (ctx.recent(e.word) && !justSaid) score += 0.5
  if (word && ctx.recentTokens.some(t => t.length >= 3 && !STOP.has(t) && t !== word && word.startsWith(t))) score += 1
  if (e.category === 'medication' && MEDICATION.test(ctx.recentTail)) score += 0.5
  if (e.category === 'person' && (FAMILY.test(ctx.recentTail) || CALL.test(ctx.recentTail))) score += 0.5
  if (e.category === 'place' && PLACE.test(ctx.recentTail)) score += 0.5
  if (tags.some(tag => ctx.place.has(tag))) score += 0.25
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
  const recentTokens = tailList.filter(t => !FILLERS.has(t)).slice(-8)
  const ctx = {
    tail: ` ${tailList.join(' ')} `,
    recentTail: ` ${recentTokens.join(' ')} `,
    recentTokens,
    place: new Set(tokens(req.place?.label ?? '')),
    recent: (word: string) => {
      const age = now - (history.get(word.toLocaleLowerCase('en')) ?? -Infinity)
      return age >= 0 && age <= RECENT_MS
    },
  }
  const scored = req.bank
    .map((entry, order) => ({ entry, order, score: scoreEntry(entry, ctx) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
  if (scored.length) {
    return scored.slice(0, n).map(({ entry, score }) =>
      withAssets({ word: entry.word, confidence: Math.min(0.6, 0.15 * score), source: 'bank' }, entry, resolve))
  }
  return []
}
