import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PredictRequest, PredictorService, Screen, SpeechState, SttService, Suggestion, Transcript } from '../../core/types'
import { MockStt, MockUI, createMockContext, type ConversationFixture } from '../../mocks'
import { createStep2 } from './index'
import { buildRequest } from './request'
import { createThrottledPredictor } from '../../ai/predictor'

type Glob = (pattern: string, opts: { eager: true; import: 'default' }) => Record<string, ConversationFixture>
const fixtures: ConversationFixture[] = Object.values((import.meta as unknown as { glob: Glob })
  .glob('../../../fixtures/conversations/*.json', { eager: true, import: 'default' }))

const suggest = (...words: string[]): Suggestion[] => words.map((word, i) => ({ word, confidence: 0.9 - i * 0.2, source: 'bank' }))

/** A predictor that takes `delayMs` like the real model, answering by `stalledAfter`. */
function slowPredictor(answers: Record<string, Suggestion[]>, delayMs = 800): PredictorService & { calls: PredictRequest[] } {
  const calls: PredictRequest[] = []
  return {
    calls,
    predict: req => {
      calls.push(req)
      return new Promise(resolve => setTimeout(() => resolve(answers[req.stalledAfter] ?? []), delayMs))
    },
  }
}

function setup(opts: { fixture?: ConversationFixture; predictor?: PredictorService; enabled?: boolean; dismissMs?: number } = {}) {
  const ui = new MockUI()
  const leave = vi.fn()
  const stt = new MockStt(opts.fixture, { now: Date.now })
  const ctx = createMockContext({
    ui, stt, leave, now: Date.now,
    predictor: opts.predictor ?? slowPredictor({}),
    flags: { step2Enabled: opts.enabled ?? true, step3Enabled: false, imuEnabled: false, mockServices: true },
  })
  const mode = createStep2({ dismissMs: opts.dismissMs ?? 20_000 })
  const last = () => ui.last() as Screen
  return { ui, ctx, mode, leave, stt, last }
}

const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms)

beforeEach(() => { vi.useFakeTimers({ now: 1_000_000 }) })
afterEach(() => { vi.useRealTimers() })

describe('Step 2 on the conversation fixtures', () => {
  const stalls = fixtures.flatMap(f => f.stalls.map(s => ({ f, s })))

  it('covers at least the 8 stall fixtures', () => {
    expect(new Set(stalls.map(x => x.f.id)).size).toBeGreaterThanOrEqual(8)
  })

  for (const { f, s } of stalls) {
    it(`${f.id} @ ${s.tMs} ms: a help tap shows "${s.intendedWord}"-type suggestions from the cache in < 300 ms`, async () => {
      const answers = Object.fromEntries(f.stalls.map(x => [x.stalledAfter, suggest(...x.expectedTop3)]))
      const { ui, ctx, mode, last } = setup({ fixture: f, predictor: slowPredictor(answers) })
      await mode.enter(ctx)
      expect(last()).toEqual({ kind: 'blank' })
      await tick(s.tMs + 1500) // the user pauses, then taps
      const tapAt = Date.now()
      ui.emit('SELECT')
      while (last().kind !== 'candidates' && Date.now() - tapAt < 5000) await tick(10)
      expect(Date.now() - tapAt).toBeLessThan(300)
      const screen = last()
      expect(screen).toMatchObject({ kind: 'candidates', index: 0, level: 1 })
      if (screen.kind === 'candidates') expect(s.expectedTop3).toContain(screen.items[0].word)
      await mode.exit()
    })
  }
})

describe('Step 2 ladder and gestures', () => {
  async function helpShown() {
    const env = setup({ predictor: { predict: async () => suggest('cup', 'mug', 'teacup') } })
    await env.mode.enter(env.ctx)
    env.ui.emit('SELECT')
    await tick(0)
    return env
  }

  it('SELECT climbs 1 → 2 → 3 and stays at 3', async () => {
    const { ui, last, mode } = await helpShown()
    expect(last()).toMatchObject({ kind: 'candidates', level: 1, index: 0 })
    for (const level of [2, 3, 3]) {
      ui.emit('SELECT'); await tick(0)
      expect(last()).toMatchObject({ kind: 'candidates', level, index: 0 })
    }
    await mode.exit()
  })

  it('NEXT / PREV cycle the top 3 and reset the ladder', async () => {
    const { ui, last, mode } = await helpShown()
    ui.emit('SELECT'); ui.emit('SELECT'); await tick(0)
    ui.emit('NEXT'); await tick(0)
    expect(last()).toMatchObject({ index: 1, level: 1 })
    ui.emit('NEXT'); ui.emit('NEXT'); await tick(0)
    expect(last()).toMatchObject({ index: 0, level: 1 })
    ui.emit('PREV'); await tick(0)
    expect(last()).toMatchObject({ index: 2, level: 1 })
    await mode.exit()
  })

  it('BACK hides the suggestions; BACK while idle leaves the mode', async () => {
    const { ui, last, leave, mode } = await helpShown()
    ui.emit('BACK'); await tick(0)
    expect(last()).toEqual({ kind: 'blank' })
    expect(leave).not.toHaveBeenCalled()
    ui.emit('BACK'); await tick(0)
    expect(leave).toHaveBeenCalledOnce()
    await mode.exit()
  })

  it('suggestions get a mouth shape and, for bank words, a picture', async () => {
    const { last, mode } = await helpShown()
    const screen = last()
    if (screen.kind !== 'candidates') throw new Error('expected candidates')
    expect(screen.items[0].mouthKey).toMatch(/^mouth:/)
    await mode.exit()
  })

  it('auto-dismisses after the timeout, counted from the last gesture', async () => {
    const env = setup({ dismissMs: 5000, predictor: { predict: async () => suggest('cup') } })
    await env.mode.enter(env.ctx)
    env.ui.emit('SELECT'); await tick(0)
    await tick(4000)
    env.ui.emit('SELECT'); await tick(0)
    await tick(4000)
    expect(env.last()).toMatchObject({ kind: 'candidates', level: 2 })
    await tick(1100)
    expect(env.last()).toEqual({ kind: 'blank' })
    await env.mode.exit()
  })

  it('shows a quiet status when there is nothing to suggest', async () => {
    const env = setup({ predictor: { predict: async () => [] } })
    await env.mode.enter(env.ctx)
    env.ui.emit('SELECT'); await tick(0)
    expect(env.last()).toEqual({ kind: 'status', text: 'No suggestion yet' })
    env.ui.emit('BACK'); await tick(0)
    expect(env.last()).toEqual({ kind: 'blank' })
    await env.mode.exit()
  })
})

describe('Step 2 listening', () => {
  const said = (text: string, tMs: number, isFinal = true) => ({ tMs, type: 'transcript' as const, text, isFinal, tStartMs: tMs - 500 })

  it('clears the display when the user says one of the suggestions, but not for earlier speech', async () => {
    const fixture: ConversationFixture = {
      id: 'heard', description: '', stalls: [],
      events: [said('please pass the cup no the', 1000), said('oh the cup', 6000)],
    }
    const env = setup({ fixture, predictor: { predict: async () => suggest('cup', 'mug') } })
    await env.mode.enter(env.ctx)
    await tick(2000)
    env.ui.emit('SELECT'); await tick(0)
    expect(env.last().kind).toBe('candidates') // "cup" was said before the help: no clear
    await tick(4500)
    expect(env.last()).toEqual({ kind: 'blank' })
    await env.mode.exit()
  })

  it('does nothing when Step 2 is turned off, except leave on BACK', async () => {
    const env = setup({ enabled: false })
    await env.mode.enter(env.ctx)
    expect(env.last()).toMatchObject({ kind: 'status' })
    env.ui.emit('SELECT'); await tick(0)
    expect(env.last()).toMatchObject({ kind: 'status' })
    env.ui.emit('BACK')
    expect(env.leave).toHaveBeenCalledOnce()
    await env.mode.exit()
  })

  it('exit stops the mic and drops late work', async () => {
    const predictor = slowPredictor({ 'the cup': suggest('cup') })
    const env = setup({ fixture: { id: 'x', description: '', stalls: [], events: [said('the cup', 100)] }, predictor })
    const stop = vi.spyOn(env.stt, 'stop')
    await env.mode.enter(env.ctx)
    await tick(200)
    env.ui.emit('SELECT')
    await env.mode.exit()
    const shown = env.ui.screens.length
    await tick(10_000)
    expect(env.ui.screens.length).toBe(shown)
    expect(stop).toHaveBeenCalled()
  })
})

describe('request and throttle', () => {
  it('builds stalledAfter from the last 4 words of the newest final', () => {
    const req = buildRequest(['We sat near the', 'playground in the'], [])
    expect(req.stalledAfter).toBe('playground in the')
    expect(buildRequest(['After breakfast I take my, um, my'], []).stalledAfter).toBe('take my, um, my')
    expect(req.n).toBe(3)
  })

  it('prefetches at most once per 5 s on the latest segment and answers help from the cache', async () => {
    const predictor = slowPredictor({ a: suggest('apple'), c: suggest('cup') }, 100)
    const t = createThrottledPredictor(predictor, { now: Date.now })
    const req = (stalledAfter: string) => ({ transcriptTail: stalledAfter, stalledAfter, bank: [], n: 3 })
    t.onFinal(req('a'))
    await tick(200)
    t.onFinal(req('b'))
    t.onFinal(req('c'))
    await tick(1000)
    expect(predictor.calls.map(c => c.stalledAfter)).toEqual(['a'])
    await tick(4000)
    expect(predictor.calls.map(c => c.stalledAfter)).toEqual(['a', 'c'])
    const items = t.onHelp(req('c'))
    await tick(0)
    expect((await items).map(i => i.word)).toEqual(['cup'])
    expect(predictor.calls).toHaveLength(2)
    t.stop()
  })

  it('does not re-fetch a request that came back empty', async () => {
    const predictor = slowPredictor({}, 100)
    const t = createThrottledPredictor(predictor, { now: Date.now })
    t.onFinal({ transcriptTail: 'hello', stalledAfter: 'hello', bank: [], n: 3 })
    await tick(30_000)
    expect(predictor.calls).toHaveLength(1)
    t.stop()
  })

  it('makes a live call on help when the cache is stale', async () => {
    const predictor = slowPredictor({ x: suggest('xylophone') }, 100)
    const t = createThrottledPredictor(predictor, { now: Date.now })
    const pending = t.onHelp({ transcriptTail: 'x', stalledAfter: 'x', bank: [], n: 3 })
    await tick(100)
    expect((await pending).map(i => i.word)).toEqual(['xylophone'])
    t.stop()
  })
})

// T-208: with batch STT (D17) a tap ends the segment being spoken (stt.flush) so the
// request includes the words just said, waiting at most ~1.2 s.
describe('Step 2 flush on a help tap (T-208)', () => {
  /** A rolling STT whose flush() emits the segment the user was still speaking. */
  class FlushingStt implements SttService {
    private subs = new Set<(t: Transcript) => void>()
    speaking = 'After breakfast I take my, um, my'
    flushDelayMs = 300 // Scribe on the trimmed segment
    flushes = 0
    async start() {}
    async stop() {}
    onTranscript(cb: (t: Transcript) => void) { this.subs.add(cb); return () => { this.subs.delete(cb) } }
    onSpeechState(_cb: (s: SpeechState) => void) { return () => {} }
    async transcribeUtterance(): Promise<Transcript> { return { text: '', isFinal: true, tStartMs: 0, tEndMs: 0, error: 'no-speech' } }
    emit(text: string) { for (const cb of [...this.subs]) cb({ text, isFinal: true, tStartMs: Date.now() - 1000, tEndMs: Date.now() }) }
    flush = vi.fn(() => {
      this.flushes++
      return new Promise<void>(resolve => setTimeout(() => { this.emit(this.speaking); resolve() }, this.flushDelayMs))
    })
  }

  function flushSetup(stt = new FlushingStt()) {
    const ui = new MockUI()
    const leave = vi.fn()
    const predictor = slowPredictor({ 'take my, um, my': suggest('lisinopril', 'metformin') }, 400)
    const ctx = createMockContext({
      ui, stt, leave, now: Date.now, predictor,
      flags: { step2Enabled: true, step3Enabled: false, imuEnabled: false, mockServices: true },
    })
    const mode = createStep2()
    return { ui, ctx, mode, stt, predictor, leave, last: () => ui.last() as Screen, logs: (e: string) => ctx.logs.filter(l => l.event === e) }
  }

  it('a tap right after a hesitation includes the words just spoken', async () => {
    const { ui, ctx, mode, stt, predictor, last } = flushSetup()
    await mode.enter(ctx)
    stt.emit('Breakfast is finished.')
    await tick(2000) // the user keeps talking: "...take my, um, my" is still being recorded
    const tapAt = Date.now()
    ui.emit('SELECT')
    while (last().kind !== 'candidates' && Date.now() - tapAt < 3000) await tick(10)
    expect(stt.flushes).toBe(1)
    const screen = last()
    expect(screen.kind).toBe('candidates')
    if (screen.kind === 'candidates') expect(screen.items.map(i => i.word)).toEqual(['lisinopril', 'metformin'])
    expect(predictor.calls.at(-1)?.stalledAfter).toBe('take my, um, my')
    expect(Date.now() - tapAt).toBeLessThan(1000) // ~300 ms flush + ~400 ms model
    await mode.exit()
  })

  it('waits at most ~1.2 s for the flush, then answers from what it has', async () => {
    const stt = new FlushingStt()
    stt.flushDelayMs = 5000 // a stuck transcription
    const { ui, ctx, mode, last, logs } = flushSetup(stt)
    await mode.enter(ctx)
    const tapAt = Date.now()
    ui.emit('SELECT')
    await tick(1150)
    expect(last()).toEqual({ kind: 'blank' }) // still waiting
    await tick(100)
    expect((logs('step2 flush').at(-1)?.data as { ms: number }).ms).toBeGreaterThanOrEqual(1200)
    await tick(500) // the model answers (nothing for an empty transcript): the user gets the usual status
    expect(last()).toEqual({ kind: 'status', text: 'No suggestion yet' })
    expect(Date.now() - tapAt).toBeLessThan(2000)
    await mode.exit()
  })

  it('skips the flush when a final arrived in the last 300 ms', async () => {
    const { ui, ctx, mode, stt } = flushSetup()
    await mode.enter(ctx)
    stt.emit('After breakfast I take my, um, my')
    await tick(100)
    ui.emit('SELECT')
    await tick(600)
    expect(stt.flushes).toBe(0)
    await mode.exit()
  })

  it('a BACK during the flush cancels the tap: nothing pops up and no lookup is spent', async () => {
    const { ui, ctx, mode, last, leave, logs } = flushSetup()
    await mode.enter(ctx)
    ui.emit('SELECT')
    await tick(100)
    ui.emit('BACK') // Step 2 is "loading": BACK hides
    await tick(2000)
    expect(last()).toEqual({ kind: 'blank' })
    expect(leave).not.toHaveBeenCalled()
    // The cancelled tap stops right after the flush: no help lookup (Gemini's free tier is 15/min, D11).
    expect(logs('step2 flush')).toEqual([])
    expect(logs('step2 help')).toEqual([])
    await mode.exit()
  })
})

