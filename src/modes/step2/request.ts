import type { PredictRequest, Suggestion, WordEntry } from '../../core/types'

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

/**
 * Steps 2-3 hint with letters only (CONTRACT_VERSION 3, D18), so suggestions carry
 * no picture or mouth shape. The predictor may attach an `imageKey` to bank words;
 * strip it so the glasses and the phone preview show the same thing.
 */
export function lettersOnly(items: Suggestion[]): Suggestion[] {
  return items.map(({ imageKey: _image, mouthKey: _mouth, ...rest }) => rest)
}
