// Does an utterance end like a word-finding stall?
//
// Measured, not assumed: ElevenLabs Scribe drops the final period on complete
// statements ("The tea smells lovely this morning" comes back unpunctuated; only
// questions keep their "?"). So terminal punctuation can only *block* a hint when it
// is present. The positive signal is what the utterance ends on: a function word
// ("pour my tea into the"), a filler ("take my, um, my"), a dangling comma, or a
// self-repair ("a cop, no, for tea, a cuh"). An utterance that ends on a content word
// ("I need the door") is indistinguishable from a complete one without a period, so it
// is not a stall unless `contentWordEndings` is switched on (precision over recall:
// a false hint on a quiet display is worse than a missed one).

export type StallReason = 'function-word' | 'filler' | 'trailing-comma' | 'self-repair' | 'content-word'

export interface EndingVerdict {
  stall: boolean
  reason?: StallReason
  /** Why it was rejected, for logs and the eval report. */
  rejected?: 'terminal-punctuation' | 'question' | 'complete' | 'empty'
}

/**
 * Words that almost never end a finished sentence: articles, determiners, possessives,
 * prepositions that need an object, conjunctions, subject pronouns. Deliberately left
 * out because they end complete sentences once STT drops the period: object pronouns
 * ("a walk with her", "thank you", "I like it"), demonstratives ("pass me that"),
 * auxiliaries and modals ("yes, I can"), phrasal-verb particles ("come in", "hold on"),
 * and "no"/"so"/"then".
 */
export const FUNCTION_WORDS = new Set(`a an the some any my your our their its another every each
  of to into onto at for with from near beside between toward towards without under
  and or but because if than as when while i we they he she`.split(/\s+/))

/** Hesitation sounds and placeholder words people use while searching for a word. */
export const FILLERS = new Set(['um', 'uh', 'er', 'erm', 'hmm', 'ah', 'eh', 'mm', 'thingy', 'whatsit', 'whatchamacallit'])

/**
 * Fillers only in context, because they also end complete sentences (ORCH, #75):
 * "like" after a verb that wants an object ("I'd like", "it looks like"), not "the one I like";
 * "thing" as a placeholder ("give me the thing"), not "one more thing" or "a good thing".
 */
const LIKE_LEAD = new Set(["would", "i'd", "we'd", "you'd", "feel", "feels", "look", "looks", "sound", "sounds", "seems", "of"]) // "kind of like", "sort of like"
const THING_LEAD = new Set(['the', 'that', 'this'])

/**
 * A self-correction set off by commas inside the utterance ("a cop, no, for tea, a cuh").
 * Requiring commas on both sides keeps "No, thank you" and "Thanks, no worries" out.
 */
const REPAIR = /,\s*(no|not|i mean|sorry|wait)\s*,/i

const words = (s: string) => s.toLowerCase().replace(/[^a-z' ,]/g, ' ').split(/[\s,]+/).filter(Boolean)

export function classifyEnding(text: string, o: { contentWordEndings?: boolean } = {}): EndingVerdict {
  const t = text.trim()
  if (!t) return { stall: false, rejected: 'empty' }
  if (/\?["')\]]*$/.test(t)) return { stall: false, rejected: 'question' } // usually the other speaker
  if (/[.!…]["')\]]*$/.test(t)) return { stall: false, rejected: 'terminal-punctuation' }
  if (/,\s*$/.test(t)) return { stall: true, reason: 'trailing-comma' }

  const w = words(t)
  const last = w[w.length - 1]
  if (!last) return { stall: false, rejected: 'empty' }
  const prev = w[w.length - 2]
  if (FILLERS.has(last) || (last === 'know' && prev === 'you')) return { stall: true, reason: 'filler' }
  if ((last === 'like' && prev !== undefined && LIKE_LEAD.has(prev)) || (last === 'thing' && prev !== undefined && THING_LEAD.has(prev))) {
    return { stall: true, reason: 'filler' }
  }
  if (FUNCTION_WORDS.has(last)) return { stall: true, reason: 'function-word' }
  // A repair in the final clause, still unterminated: "Please bring me a cop, no, for tea, a cuh".
  if (REPAIR.test(t.slice(Math.max(0, t.length - 60)))) return { stall: true, reason: 'self-repair' }
  if (o.contentWordEndings) return { stall: true, reason: 'content-word' }
  return { stall: false, rejected: 'complete' }
}

/** The last `n` words of an utterance, as the predictor's `stalledAfter` (fixtures use 4). */
export function lastWords(text: string, n = 4): string {
  const parts = text.trim().split(/\s+/)
  return parts.slice(-n).join(' ')
}
