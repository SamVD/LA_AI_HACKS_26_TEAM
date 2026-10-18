import type { Transcript } from '../../core/types'

/**
 * The recent conversation, for prediction (Steps 2-3) and stall detection
 * (T-301). Holds final segments with their times on the ModeContext clock, plus
 * the latest partial. Bounded by age and count, so it never grows during a
 * long session.
 */
export class TranscriptBuffer {
  private finals: Transcript[] = []
  private partial: Transcript | null = null

  constructor(private readonly opts: { maxAgeMs?: number; maxSegments?: number } = {}) {}

  push(t: Transcript): void {
    if (t.error || !t.text.trim()) return
    if (!t.isFinal) { this.partial = t; return }
    this.partial = null
    this.finals.push(t)
    const maxSegments = this.opts.maxSegments ?? 200
    if (this.finals.length > maxSegments) this.finals.splice(0, this.finals.length - maxSegments)
    const maxAge = this.opts.maxAgeMs ?? 10 * 60_000
    const cutoff = t.tEndMs - maxAge
    while (this.finals.length && this.finals[0].tEndMs < cutoff) this.finals.shift()
  }

  /** Final segments that ended within the last `ms` before `now`, oldest first. */
  lastSeconds(ms: number, now: number): Transcript[] {
    return this.finals.filter(t => t.tEndMs >= now - ms)
  }

  /** The last `n` words of the final text (plus the current partial if `withPartial`). */
  lastWords(n: number, withPartial = false): string {
    const parts = this.finals.map(t => t.text)
    if (withPartial && this.partial) parts.push(this.partial.text)
    return parts.join(' ').split(/\s+/).filter(Boolean).slice(-n).join(' ')
  }

  /** Final segments, oldest first. */
  segments(): readonly Transcript[] { return this.finals }

  /** The in-progress partial, if speech is ongoing. */
  current(): Transcript | null { return this.partial }

  clear(): void {
    this.finals = []
    this.partial = null
  }
}
