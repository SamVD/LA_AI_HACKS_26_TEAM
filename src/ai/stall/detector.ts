import { classifyEnding, lastWords, type StallReason } from './ending'

// T-301: decides when Step 3 should show a hint without being asked.
//
// Silence alone cannot separate a stall from a normal pause (T-007: some normal pauses
// are longer than every annotated stall), so the detector combines silence after speech
// with how the last utterance ended (ending.ts). Pure: no timers, no SDK. Feed it
// speech-state and transcript events plus periodic ticks (attach.ts does this from an
// SttService), and it returns a StallSignal at most once per silence.

export interface StallConfig {
  /** Silence after the last word before a hint. Annotated stalls run 2.2-4 s. */
  minSilenceMs: number
  /** STT finals lag speech (~1 s, D5). Wait this much longer for one before judging the partial. */
  finalWaitMs: number
  /** No new hint this long after the previous one. */
  cooldownMs: number
  /** Hard cap on hints in any rolling minute. */
  maxPerMinute: number
  /** Also hint after content-word endings ("I need the door"). Off: these match complete sentences once STT drops the period. */
  contentWordEndings: boolean
  /** Silence required for a content-word ending, when enabled. */
  contentWordSilenceMs: number
  /** Words of context in `transcriptTail` (PredictRequest wants ~30-40). */
  tailWords: number
  /** Words in `stalledAfter` (the fixtures' annotations use 4). */
  stalledAfterWords: number
}

/** Starting guesses (PLAN §12 item 9): tuned against T-007 fixtures, to be re-tuned live at G2/G3. */
export const DEFAULT_STALL_CONFIG: StallConfig = {
  minSilenceMs: 1500,
  finalWaitMs: 1500,
  cooldownMs: 10_000,
  maxPerMinute: 3,
  contentWordEndings: false,
  contentWordSilenceMs: 2500,
  tailWords: 40,
  stalledAfterWords: 4,
}

export type StallEvent =
  | { type: 'speech'; speaking: boolean; tMs: number }
  | { type: 'transcript'; text: string; isFinal: boolean; tMs: number }
  | { type: 'tick'; tMs: number }

export interface StallSignal {
  /** When the detector decided (ModeContext clock). */
  tMs: number
  /** Start of the silence that is the stall. */
  silenceStartMs: number
  silenceMs: number
  reason: StallReason
  /** The last utterance as heard, ending at the stall. */
  utterance: string
  /** For PredictRequest.transcriptTail: recent conversation ending at the stall. */
  transcriptTail: string
  /** For PredictRequest.stalledAfter: the last few words before the stall. */
  stalledAfter: string
  /** True when the final transcript never arrived and the partial was used. */
  usedPartial: boolean
}

export interface StallDetector {
  onEvent(e: StallEvent): StallSignal | null
  /** Earliest time a tick could produce a signal, or null when nothing is pending. Lets callers sleep instead of polling. */
  nextCheckMs(): number | null
  /** Forget everything (mode exit, pause). */
  reset(): void
}

export function createStallDetector(overrides: Partial<StallConfig> = {}): StallDetector {
  const c: StallConfig = { ...DEFAULT_STALL_CONFIG, ...overrides }
  let finals: string[] = []
  let partial: string | null = null
  let speaking = false
  let silenceStart: number | null = null
  let burstHasFinal = false // a final transcript arrived for the latest burst of speech
  let decided = false // this silence has a verdict (may be revised by a late final, unless fired)
  let fired = false // this silence produced, or was rate-limited out of, a hint: final
  let hints: number[] = []

  const reset = () => {
    finals = []
    partial = null
    speaking = false
    silenceStart = null
    burstHasFinal = false
    decided = false
    fired = false
    hints = []
  }

  const tail = (extra?: string) => {
    const all = [...finals, ...(extra ? [extra] : [])].join(' ').trim().split(/\s+/).filter(Boolean)
    return all.slice(-c.tailWords).join(' ')
  }

  function evaluate(now: number): StallSignal | null {
    if (speaking || silenceStart === null || decided || fired) return null
    const silenceMs = now - silenceStart
    if (silenceMs < c.minSilenceMs) return null

    let utterance: string
    let usedPartial = false
    if (burstHasFinal && finals.length) utterance = finals[finals.length - 1]
    else if (partial && silenceMs >= c.minSilenceMs + c.finalWaitMs) { utterance = partial; usedPartial = true }
    else return null // nothing heard yet for this burst; keep waiting

    const v = classifyEnding(utterance, { contentWordEndings: c.contentWordEndings })
    if (!v.stall || !v.reason) { decided = true; return null }
    if (v.reason === 'content-word' && silenceMs < c.contentWordSilenceMs) return null

    decided = true
    fired = true
    hints = hints.filter(t => t > now - 60_000)
    const last = hints[hints.length - 1]
    if ((last !== undefined && now - last < c.cooldownMs) || hints.length >= c.maxPerMinute) return null
    hints.push(now)
    return {
      tMs: now,
      silenceStartMs: silenceStart,
      silenceMs,
      reason: v.reason,
      utterance,
      transcriptTail: tail(usedPartial ? utterance : undefined),
      stalledAfter: lastWords(utterance, c.stalledAfterWords),
      usedPartial,
    }
  }

  return {
    onEvent(e) {
      if (e.type === 'speech') {
        if (e.speaking) {
          if (!speaking) burstHasFinal = false
          speaking = true
          silenceStart = null
          decided = false
          fired = false
          return null
        }
        if (speaking) silenceStart = e.tMs
        speaking = false
        return evaluate(e.tMs)
      }
      if (e.type === 'transcript') {
        const text = e.text.trim()
        if (!text) return evaluate(e.tMs) // D5: realtime VAD sends empty commits; ignore them
        if (e.isFinal) {
          finals.push(text)
          if (finals.length > 30) finals = finals.slice(-30)
          partial = null
          burstHasFinal = true
          if (!fired) decided = false // a late final can revise a 'complete' verdict, never a hint
        } else {
          partial = text
        }
        return evaluate(e.tMs)
      }
      return evaluate(e.tMs)
    },
    nextCheckMs() {
      if (speaking || silenceStart === null || decided || fired) return null
      if (burstHasFinal) return silenceStart + c.minSilenceMs
      return partial ? silenceStart + c.minSilenceMs + c.finalWaitMs : null
    },
    reset,
  }
}
