import type { ConversationFixture } from '../../mocks/fixtures'
import { createStallDetector, type StallConfig, type StallEvent, type StallSignal } from './detector'

// T-301 acceptance: precision/recall of auto-hints over the T-007 conversation fixtures.
//
// Every silence (speech end → next speech start) is a gap. A gap is positive when a
// fixture stall starts there (stalls[].tMs is the silence onset). A hint inside a
// positive gap is a true positive; inside any other gap, a false positive (the thing
// Step 3 must not do on a quiet display). Variants model real STT, which the fixtures
// are cleaner than: Scribe drops final periods, and finals arrive ~1 s after speech.

export type Variant = 'as-is' | 'no-final-period' | 'late-finals' | 'no-final-period+late-finals'
export const VARIANTS: Variant[] = ['as-is', 'no-final-period', 'late-finals', 'no-final-period+late-finals']

export interface ReplayOptions {
  variant?: Variant
  /** Final-transcript delay for the late-finals variants. */
  lateMs?: number
  /** Tick resolution. The app's attach.ts uses 200 ms; finer here for latency numbers. */
  tickMs?: number
  /** Keep ticking this long after the last event (a stall at the very end still counts). */
  trailMs?: number
}

export function variantEvents(fx: ConversationFixture, variant: Variant = 'as-is', lateMs = 1000): StallEvent[] {
  const stripPeriod = variant.includes('no-final-period')
  const late = variant.includes('late-finals')
  const events: StallEvent[] = fx.events.map(e => {
    if (e.type === 'speech') return { type: 'speech', speaking: e.speaking, tMs: e.tMs }
    const text = stripPeriod ? e.text.replace(/[.!]+\s*$/, '') : e.text
    return { type: 'transcript', text, isFinal: e.isFinal, tMs: e.tMs + (late && e.isFinal ? lateMs : 0) }
  })
  return events.sort((a, b) => a.tMs - b.tMs)
}

export function replay(fx: ConversationFixture, config: Partial<StallConfig> = {}, o: ReplayOptions = {}): StallSignal[] {
  const d = createStallDetector(config)
  const events = variantEvents(fx, o.variant, o.lateMs)
  const tick = o.tickMs ?? 100
  const end = (events[events.length - 1]?.tMs ?? 0) + (o.trailMs ?? 10_000)
  const signals: StallSignal[] = []
  let i = 0
  for (let t = 0; t <= end; t += tick) {
    while (i < events.length && events[i].tMs <= t) {
      const s = d.onEvent(events[i++])
      if (s) signals.push(s)
    }
    const s = d.onEvent({ type: 'tick', tMs: t })
    if (s) signals.push(s)
  }
  return signals
}

export interface GapResult {
  fixture: string
  startMs: number
  endMs: number | null
  stall: boolean
  hinted: boolean
  latencyMs?: number
  utterance?: string
}

export function scoreFixture(fx: ConversationFixture, signals: StallSignal[]): GapResult[] {
  const gaps: GapResult[] = []
  let open: GapResult | null = null
  const stallStarts = new Set(fx.stalls.map(s => s.tMs))
  for (const e of fx.events) {
    if (e.type !== 'speech') continue
    if (!e.speaking) {
      open = { fixture: fx.id, startMs: e.tMs, endMs: null, stall: stallStarts.has(e.tMs), hinted: false }
      gaps.push(open)
    } else if (open) {
      open.endMs = e.tMs
      open = null
    }
  }
  for (const s of signals) {
    const g = gaps.find(g => s.silenceStartMs >= g.startMs && (g.endMs === null || s.silenceStartMs < g.endMs))
    if (!g) continue
    g.hinted = true
    g.latencyMs ??= s.tMs - g.startMs
    g.utterance ??= s.utterance
  }
  return gaps
}

export interface EvalSummary {
  variant: Variant
  stalls: number
  normalPauses: number
  truePositives: number
  falsePositives: number
  misses: number
  precision: number
  recall: number
  meanLatencyMs: number | null
  maxLatencyMs: number | null
  falsePositiveGaps: GapResult[]
  missedGaps: GapResult[]
}

export function evaluate(fixtures: ConversationFixture[], config: Partial<StallConfig> = {}, o: ReplayOptions = {}): EvalSummary {
  const gaps = fixtures.flatMap(fx => scoreFixture(fx, replay(fx, config, o)))
  const tp = gaps.filter(g => g.stall && g.hinted)
  const fp = gaps.filter(g => !g.stall && g.hinted)
  const fn = gaps.filter(g => g.stall && !g.hinted)
  const lat = tp.map(g => g.latencyMs!).filter(n => Number.isFinite(n))
  const round = (n: number) => Math.round(n * 1000) / 1000
  return {
    variant: o.variant ?? 'as-is',
    stalls: tp.length + fn.length,
    normalPauses: gaps.length - tp.length - fn.length,
    truePositives: tp.length,
    falsePositives: fp.length,
    misses: fn.length,
    precision: tp.length + fp.length ? round(tp.length / (tp.length + fp.length)) : 1,
    recall: tp.length + fn.length ? round(tp.length / (tp.length + fn.length)) : 1,
    meanLatencyMs: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null,
    maxLatencyMs: lat.length ? Math.max(...lat) : null,
    falsePositiveGaps: fp,
    missedGaps: fn,
  }
}
