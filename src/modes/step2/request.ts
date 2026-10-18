import type { PredictRequest, Suggestion, WordEntry } from '../../core/types'
import { mouthKeyFor, resolveAssets } from '../../content'

const TAIL_WORDS = 30
const STALLED_WORDS = 4

/**
 * The prediction request for the conversation so far: the last ~30 words, and
 * the last 4 words of the newest final segment as `stalledAfter` (the shape of
 * the T-004 fixtures).
 */
export function buildRequest(finals: string[], bank: WordEntry[], n = 3): PredictRequest {
  const words = finals.join(' ').split(/\s+/).filter(Boolean)
  const latest = (finals.at(-1) ?? '').split(/\s+/).filter(Boolean)
  return {
    transcriptTail: words.slice(-TAIL_WORDS).join(' '),
    stalledAfter: latest.slice(-STALLED_WORDS).join(' '),
    bank,
    n,
  }
}

/** Fills in a picture and mouth shape for suggestions that lack them (bank words get both; others get a mouth shape). */
export function withAssets(items: Suggestion[], bank: WordEntry[]): Suggestion[] {
  return items.map(item => {
    const entry = bank.find(e => e.word.toLowerCase() === item.word.toLowerCase())
      ?? { id: item.word.toLowerCase(), word: item.word, category: 'other' as const, frames: [], tags: [] }
    const assets = resolveAssets(entry)
    const imageKey = item.imageKey ?? assets.imageKey
    const mouthKey = item.mouthKey ?? mouthKeyFor(entry)
    return { ...item, ...(imageKey ? { imageKey } : {}), ...(mouthKey ? { mouthKey } : {}) }
  })
}
