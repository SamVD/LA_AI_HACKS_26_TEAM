/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import type { ConversationFixture } from '../../mocks/fixtures'
import { evaluate, replay, scoreFixture, VARIANTS } from './evaluate'

const fixtures = Object.values(
  import.meta.glob<ConversationFixture>('../../../fixtures/conversations/*.json', { eager: true, import: 'default' }),
)

// T-301 acceptance over the T-007 fixtures. The bar for Step 3 on a quiet display:
// no false hints in any replayed normal pause, on clean fixtures and on the
// real-STT variants (Scribe drops final periods; finals arrive ~1 s late).
describe('stall detector on fixtures/conversations', () => {
  it('loads all T-007 conversations', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(11)
    expect(fixtures.reduce((n, f) => n + f.stalls.length, 0)).toBeGreaterThanOrEqual(12)
  })

  it.each(VARIANTS)('%s: zero false hints, recall >= 11/12, hint within 1.5-2.5 s of the stall', variant => {
    const r = evaluate(fixtures, {}, { variant })
    expect(r.falsePositiveGaps).toEqual([])
    expect(r.precision).toBe(1)
    expect(r.recall).toBeGreaterThanOrEqual(11 / 12 - 1e-9)
    expect(r.meanLatencyMs).toBeGreaterThanOrEqual(1500)
    expect(r.maxLatencyMs).toBeLessThanOrEqual(2500)
  })

  it('misses only the content-word stall ("I need the door"), by design', () => {
    const r = evaluate(fixtures)
    expect(r.missedGaps.map(g => `${g.fixture}@${g.startMs}`)).toEqual(['clean-stall@35100'])
  })

  it('content-word endings would spam hints once STT drops the period (why it is off)', () => {
    const r = evaluate(fixtures, { contentWordEndings: true }, { variant: 'no-final-period' })
    expect(r.falsePositives).toBeGreaterThan(10)
  })

  it('every hint carries the stall\'s own words as stalledAfter', () => {
    for (const fx of fixtures) {
      const signals = replay(fx)
      for (const g of scoreFixture(fx, signals).filter(g => g.stall && g.hinted)) {
        const annotated = fx.stalls.find(s => s.tMs === g.startMs)!
        const hint = signals.find(s => s.silenceStartMs === g.startMs)!
        expect(hint.stalledAfter).toBe(annotated.stalledAfter)
        expect(hint.transcriptTail.endsWith(annotated.stalledAfter)).toBe(true)
      }
    }
  })
})
