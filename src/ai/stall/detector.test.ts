import { describe, expect, it } from 'vitest'
import { createStallDetector, type StallConfig, type StallEvent, type StallSignal } from './detector'

const sp = (speaking: boolean, tMs: number): StallEvent => ({ type: 'speech', speaking, tMs })
const fin = (text: string, tMs: number): StallEvent => ({ type: 'transcript', text, isFinal: true, tMs })
const part = (text: string, tMs: number): StallEvent => ({ type: 'transcript', text, isFinal: false, tMs })

/** Feed events, ticking every 100 ms up to `untilMs`; return all signals. */
function run(events: StallEvent[], untilMs: number, config: Partial<StallConfig> = {}) {
  const d = createStallDetector(config)
  const out: StallSignal[] = []
  const evs = [...events].sort((a, b) => a.tMs - b.tMs)
  let i = 0
  for (let t = 0; t <= untilMs; t += 100) {
    while (i < evs.length && evs[i].tMs <= t) { const s = d.onEvent(evs[i++]); if (s) out.push(s) }
    const s = d.onEvent({ type: 'tick', tMs: t })
    if (s) out.push(s)
  }
  return { out, d }
}

/** One utterance: speech 0-2 s, final at 2 s, then silence. */
const utterance = (text: string, at = 0) => [sp(true, at), fin(text, at + 2000), sp(false, at + 2000)]

describe('createStallDetector', () => {
  it('fires once, minSilenceMs after an unfinished utterance, with predictor-ready context', () => {
    const { out } = run([...utterance('The tea smells lovely.', 0), ...utterance('Yes, please pour my tea into the', 5000)], 12_000)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      tMs: 8500, silenceStartMs: 7000, silenceMs: 1500, reason: 'function-word', usedPartial: false,
      utterance: 'Yes, please pour my tea into the', stalledAfter: 'my tea into the',
      transcriptTail: 'The tea smells lovely. Yes, please pour my tea into the',
    })
  })

  it('stays quiet after a complete sentence, however long the silence', () => {
    expect(run(utterance('We can sit by the window'), 30_000).out).toEqual([])
  })

  it('cancels when speech resumes before the threshold', () => {
    const { out } = run([...utterance('I would like some'), sp(true, 3000), fin('I would like some eggs.', 4000), sp(false, 4000)], 10_000)
    expect(out).toEqual([])
  })

  it('waits for a late final instead of judging too early', () => {
    // Speech ends at 2 s; the final only arrives at 3.2 s (STT lag).
    const { out } = run([sp(true, 0), part('pour my tea into', 1500), sp(false, 2000), fin('pour my tea into the', 3200)], 8000)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ tMs: 3500, usedPartial: false, utterance: 'pour my tea into the' })
  })

  it('lets a late final overturn a "complete" verdict made on stale text', () => {
    // A previous burst's final is complete; this burst's final arrives late and is unfinished.
    const events = [...utterance('Good morning.', 0), sp(true, 3000), sp(false, 5000), fin('Could you pass the', 6800)]
    const { out } = run(events, 10_000)
    expect(out).toHaveLength(1)
    expect(out[0].utterance).toBe('Could you pass the')
  })

  it('falls back to the partial when no final ever arrives', () => {
    const { out } = run([sp(true, 0), part('I take my, um', 1800), sp(false, 2000)], 8000)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ tMs: 5000, usedPartial: true, reason: 'filler', transcriptTail: 'I take my, um' })
  })

  it('never fires twice in one silence, even if another final arrives', () => {
    // Rate limits off, so only the once-per-silence guard can stop the second hint.
    const { out } = run([...utterance('pour it into the'), fin('pour it into the, uh', 4000)], 12_000, { cooldownMs: 0, maxPerMinute: 99 })
    expect(out).toHaveLength(1)
  })

  it('ignores empty commits (D5)', () => {
    const { out } = run([...utterance('pour it into the'), fin('   ', 2500)], 8000)
    expect(out).toHaveLength(1)
    expect(out[0].utterance).toBe('pour it into the')
  })

  it('enforces the cooldown between hints', () => {
    const events = [...utterance('into the', 0), ...utterance('out of the', 5000), ...utterance('next to the', 13_000)]
    const { out } = run(events, 25_000, { cooldownMs: 10_000 })
    expect(out.map(s => s.silenceStartMs)).toEqual([2000, 15_000]) // the 7 s one is inside the cooldown
  })

  it('caps hints per rolling minute', () => {
    const events = [0, 5000, 10_000, 15_000, 20_000].flatMap(at => utterance('into the', at))
    const { out } = run(events, 30_000, { cooldownMs: 0, maxPerMinute: 3 })
    expect(out).toHaveLength(3)
  })

  it('needs a longer silence for content-word endings, and only when enabled', () => {
    expect(run(utterance('I need the door'), 10_000).out).toEqual([])
    const { out } = run(utterance('I need the door'), 10_000, { contentWordEndings: true, contentWordSilenceMs: 2500 })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ reason: 'content-word', silenceMs: 2500 })
  })

  it('reports when the next tick could matter, so callers need not poll', () => {
    const d = createStallDetector()
    expect(d.nextCheckMs()).toBeNull()
    d.onEvent(sp(true, 0))
    expect(d.nextCheckMs()).toBeNull() // speaking
    d.onEvent(sp(false, 2000))
    expect(d.nextCheckMs()).toBeNull() // nothing heard for this burst yet
    d.onEvent(part('pour it into', 2100))
    expect(d.nextCheckMs()).toBe(2000 + 1500 + 1500) // waiting for a final, then the partial
    d.onEvent(fin('pour it into the', 2300))
    expect(d.nextCheckMs()).toBe(3500)
    expect(d.onEvent({ type: 'tick', tMs: 3500 })?.reason).toBe('function-word')
    expect(d.nextCheckMs()).toBeNull()
  })

  it('reset() forgets history and rate limits', () => {
    const d = createStallDetector({ maxPerMinute: 1 })
    for (const e of utterance('into the')) d.onEvent(e)
    expect(d.onEvent({ type: 'tick', tMs: 3500 })).not.toBeNull()
    d.reset()
    for (const e of utterance('out of the', 5000)) d.onEvent(e)
    expect(d.onEvent({ type: 'tick', tMs: 8500 })?.transcriptTail).toBe('out of the')
  })
})
