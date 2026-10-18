import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PredictRequest, PredictorService, Screen, Suggestion } from '../../core/types'
import { MockStt, MockUI, createMockContext, type ConversationFixture } from '../../mocks'
import type { StallDetector } from '../../ai/stall'
import { createStep3, type Step3Options } from './index'

type Glob = (pattern: string, opts: { eager: true; import: 'default' }) => Record<string, ConversationFixture>
const fixtures: ConversationFixture[] = Object.values((import.meta as unknown as { glob: Glob })
  .glob('../../../fixtures/conversations/*.json', { eager: true, import: 'default' }))
const fixture = (id: string) => fixtures.find(f => f.id === id)!

const suggest = (...words: string[]): Suggestion[] => words.map((word, i) => ({ word, confidence: 0.9 - i * 0.2, source: 'bank' }))

/** Answers by `stalledAfter` after `delayMs`, like the real model behind the throttle. */
function slowPredictor(answers: Record<string, Suggestion[]>, delayMs = 800): PredictorService & { calls: PredictRequest[] } {
  const calls: PredictRequest[] = []
  return { calls, predict: req => { calls.push(req); return new Promise(r => setTimeout(() => r(answers[req.stalledAfter] ?? []), delayMs)) } }
}

function setup(o: { fixture?: ConversationFixture; predictor?: PredictorService; step3?: boolean; options?: Step3Options } = {}) {
  const ui = new MockUI()
  const leave = vi.fn()
  const stt = new MockStt(o.fixture, { now: Date.now })
  const startSpy = vi.spyOn(stt, 'start')
  const ctx = createMockContext({
    ui, stt, leave, now: Date.now,
    predictor: o.predictor ?? slowPredictor({}),
    flags: { step2Enabled: false, step3Enabled: o.step3 ?? true, imuEnabled: false, mockServices: true },
  })
  const mode = createStep3(o.options)
  const t0 = Date.now()
  const shown = () => ui.screens.map(s => s.kind)
  const candidatesAt = () => ui.screens.flatMap((s, i) => (s.kind === 'candidates' ? [i] : []))
  return { ui, ctx, mode, leave, stt, startSpy, t0, shown, candidatesAt, last: () => ui.last() as Screen }
}

const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms)
const logged = (ctx: ReturnType<typeof setup>['ctx'], event: string) => ctx.logs.filter(l => l.event === event)

beforeEach(() => { vi.useFakeTimers({ now: 1_000_000 }) })
afterEach(() => { vi.useRealTimers() })

describe('Step 3 on the conversation fixtures (acceptance)', () => {
  const answersFor = (f: ConversationFixture) => Object.fromEntries(f.stalls.map(x => [x.stalledAfter, suggest(...x.expectedTop3)]))
  const stalls = fixtures.flatMap(f => f.stalls.map(s => ({ f, s })))
    // "I need the door" ends on a content word: not auto-hinted by design (T-301). Step 2's tap still covers it.
    .filter(({ s }) => s.stalledAfter !== 'I need the door')

  it('replays 11 auto-hintable stalls across the fixtures', () => {
    expect(stalls.length).toBe(11)
  })

  for (const { f, s } of stalls) {
    it(`${f.id} @ ${s.tMs} ms: shows "${s.intendedWord}"-type suggestions on its own, ~1.5 s into the stall`, async () => {
      const { ctx, mode, ui, last } = setup({ fixture: f, predictor: slowPredictor(answersFor(f)) })
      await mode.enter(ctx)
      await tick(s.tMs) // the stall's silence starts now; nobody taps
      const before = ui.screens.length
      let waited = 0
      while (last().kind !== 'candidates' && waited < 4000) { await tick(50); waited += 50 }
      expect(waited).toBeGreaterThanOrEqual(1400)
      expect(waited).toBeLessThanOrEqual(2600) // 1.5 s detector + tick + (cached) prediction
      const screen = last()
      expect(screen).toMatchObject({ kind: 'candidates', index: 0, level: 1 })
      if (screen.kind === 'candidates') expect(s.expectedTop3).toContain(screen.items[0].word)
      expect(ui.screens.slice(before).some(x => x.kind === 'status')).toBe(false)
      expect(logged(ctx, 'step3 auto-hint').at(-1)?.data).toMatchObject({ stalledAfter: s.stalledAfter })
      await mode.exit()
    })
  }

  it.each(['no-stall', 'appointment-pause'])('%s: the display stays blank for the whole conversation', async id => {
    const { ctx, mode, shown } = setup({ fixture: fixture(id), predictor: slowPredictor({}, 10) })
    await mode.enter(ctx)
    await tick(100_000)
    expect(new Set(shown())).toEqual(new Set(['blank']))
    expect(logged(ctx, 'step3 auto-hint')).toEqual([])
    await mode.exit()
  })
})

describe('Step 3 behavior', () => {
  const f = () => fixture('breakfast-stalls')
  const answers = () => Object.fromEntries(f().stalls.map(x => [x.stalledAfter, suggest(...x.expectedTop3)]))
  async function autoHinted() {
    const env = setup({ fixture: f(), predictor: slowPredictor(answers()) })
    await env.mode.enter(env.ctx)
    await tick(f().stalls[0].tMs + 2600)
    expect(env.last().kind).toBe('candidates')
    return env
  }

  it('a tap after an auto-hint climbs the cue ladder (Step 2 behavior)', async () => {
    const { ui, mode, last } = await autoHinted()
    ui.emit('SELECT')
    await tick(0)
    expect(last()).toMatchObject({ kind: 'candidates', level: 2 })
    ui.emit('NEXT')
    await tick(0)
    expect(last()).toMatchObject({ kind: 'candidates', index: 1, level: 1 })
    await mode.exit()
  })

  it('speaking the word clears the display (Step 2 behavior)', async () => {
    const { last, mode } = await autoHinted()
    await tick(4000) // breakfast-stalls: the user then says "Eggs. I like them scrambled."
    expect(last()).toEqual({ kind: 'blank' })
    await mode.exit()
  })

  it('an auto-hint that finds nothing stays blank (no unrequested "No suggestion yet")', async () => {
    const { ctx, mode, shown } = setup({ fixture: f(), predictor: slowPredictor({}, 10) })
    await mode.enter(ctx)
    await tick(f().stalls[0].tMs + 3000)
    expect(shown()).not.toContain('status')
    expect(logged(ctx, 'step3 auto-hint empty').length).toBe(1)
    await mode.exit()
  })

  it('a user tap that finds nothing still says so (Step 2 behavior is unchanged)', async () => {
    const { ctx, mode, ui, last } = setup({ predictor: slowPredictor({}, 10) })
    await mode.enter(ctx)
    ui.emit('SELECT')
    await tick(50)
    expect(last()).toEqual({ kind: 'status', text: 'No suggestion yet' })
    await mode.exit()
  })

  it('never interrupts suggestions already on screen', async () => {
    const { ctx, mode, ui, last } = setup({ fixture: f(), predictor: slowPredictor(answers(), 10) })
    await mode.enter(ctx)
    await tick(f().stalls[0].tMs + 200)
    ui.emit('SELECT') // the user taps for help 0.2 s into the stall, before the detector's 1.5 s
    await tick(3000)
    expect(last().kind).toBe('candidates')
    expect(logged(ctx, 'step3 auto-hint skipped').at(-1)?.data).toMatchObject({ why: 'showing candidates' })
    await mode.exit()
  })

  it('a swipe on the blank display pauses auto-hints, another resumes them', async () => {
    const { ctx, mode, ui, last } = setup({ fixture: f(), predictor: slowPredictor(answers()) })
    await mode.enter(ctx)
    ui.emit('NEXT')
    await tick(0)
    expect(last()).toMatchObject({ kind: 'status', text: expect.stringContaining('paused') })
    await tick(1600)
    expect(last()).toEqual({ kind: 'blank' })
    await tick(f().stalls[0].tMs + 3000)
    expect(last()).toEqual({ kind: 'blank' })
    expect(logged(ctx, 'step3 auto-hint skipped').at(-1)?.data).toMatchObject({ why: 'paused' })
    ui.emit('PREV')
    await tick(0)
    expect(last()).toMatchObject({ kind: 'status', text: 'Auto-hints on.' })
    await tick(f().stalls[1].tMs - (f().stalls[0].tMs + 3000) + 2600 - 1600)
    expect(last().kind).toBe('candidates') // the second stall is hinted again
    await mode.exit()
  })

  it('falls back to Step 2 if the detector throws: no auto-hints, taps still work', async () => {
    const boom: StallDetector = { onEvent: () => { throw new Error('boom') }, nextCheckMs: () => 0, reset: () => {} }
    const { ctx, mode, ui, last } = setup({ fixture: f(), predictor: slowPredictor(answers(), 10), options: { makeDetector: () => boom } })
    await mode.enter(ctx)
    await tick(f().stalls[0].tMs + 3000)
    expect(logged(ctx, 'step3 detector failed; continuing as Step 2').length).toBe(1)
    expect(last()).toEqual({ kind: 'blank' })
    ui.emit('SELECT')
    await tick(50)
    expect(last().kind).toBe('candidates')
    await mode.exit()
  })

  it('flag off: shows that Step 3 is off, starts nothing, BACK leaves', async () => {
    const { ctx, mode, ui, last, leave, startSpy } = setup({ fixture: f(), step3: false })
    await mode.enter(ctx)
    expect(last()).toEqual({ kind: 'status', text: 'Step 3 is turned off.\nDouble-tap to go back.' })
    await tick(60_000)
    expect(startSpy).not.toHaveBeenCalled()
    expect(ui.screens).toHaveLength(1)
    ui.emit('SELECT')
    ui.emit('BACK')
    expect(leave).toHaveBeenCalledTimes(1)
    await mode.exit()
  })

  it('exit() stops the mic and leaves no timers behind', async () => {
    const { ctx, mode, stt } = setup({ fixture: f(), predictor: slowPredictor(answers()) })
    const stop = vi.spyOn(stt, 'stop')
    await mode.enter(ctx)
    await tick(f().stalls[0].tMs + 2600)
    await mode.exit()
    expect(stop).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
