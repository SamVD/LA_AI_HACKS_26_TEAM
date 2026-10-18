import type { SttService } from '../../core/types'
import type { StallDetector, StallSignal } from './detector'

// Wires a StallDetector to an SttService for Step 3 (T-302): speech state and
// transcripts go in as events, a timer supplies ticks, and signals come out.
// If the detector throws, it is detached and `onError` fires once, so the mode can
// fall back to Step 2 behavior (T-302 spec). `onStall` runs inside the same guard, so an
// exception in the caller's own handler degrades the same way: fail quiet, never crash the mode.

export interface AttachOptions {
  now?: () => number
  /** Tick period while a stall could be pending. */
  tickMs?: number
  onError?: (e: unknown) => void
  setInterval?: (fn: () => void, ms: number) => unknown
  clearInterval?: (h: unknown) => void
}

export function attachStallDetector(
  stt: Pick<SttService, 'onSpeechState' | 'onTranscript'>,
  detector: StallDetector,
  onStall: (s: StallSignal) => void,
  o: AttachOptions = {},
): () => void {
  const now = o.now ?? Date.now
  const setIv = o.setInterval ?? ((fn, ms) => setInterval(fn, ms))
  const clearIv = o.clearInterval ?? (h => clearInterval(h as ReturnType<typeof setInterval>))
  let alive = true

  const feed = (run: () => StallSignal | null) => {
    if (!alive) return
    try {
      const s = run()
      if (s) onStall(s)
    } catch (e) {
      detach()
      o.onError?.(e)
    }
  }

  const offSpeech = stt.onSpeechState(s => feed(() => detector.onEvent({ type: 'speech', speaking: s.speaking, tMs: s.tMs })))
  const offText = stt.onTranscript(t => feed(() => detector.onEvent({ type: 'transcript', text: t.text, isFinal: t.isFinal, tMs: t.tEndMs, speaker: t.speaker })))
  const timer = setIv(() => {
    if (detector.nextCheckMs() === null) return // nothing pending: cheap no-op
    feed(() => detector.onEvent({ type: 'tick', tMs: now() }))
  }, o.tickMs ?? 200)

  function detach() {
    if (!alive) return
    alive = false
    offSpeech()
    offText()
    clearIv(timer)
  }
  return detach
}
