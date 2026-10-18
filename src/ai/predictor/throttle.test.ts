import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PredictRequest, Suggestion, WordEntry } from '../../core/types'
import words from '../../content/words.json'
import { createThrottledPredictor } from './throttle'
import { createPredictor, rateLimitedUntil } from './service'

const request = (seq = 0): PredictRequest => ({
  transcriptTail: `segment ${seq}`, stalledAfter: 'the', bank: words as WordEntry[], n: 3,
})
const items = (word = 'mug'): Suggestion[] => [{ word, confidence: 0.8, source: 'model' }]
const start = () => { vi.useFakeTimers(); vi.setSystemTime(0) }
const settle = async () => { await vi.advanceTimersByTimeAsync(0) }
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

function setup(latency = 650) {
  start()
  const calls: { at: number; request: PredictRequest; signal?: AbortSignal }[] = []
  const predict = vi.fn((req: PredictRequest, signal?: AbortSignal) => {
    calls.push({ at: Date.now(), request: req, signal })
    return new Promise<Suggestion[]>(resolve => setTimeout(() => resolve(items(req.transcriptTail)), latency))
  })
  const throttle = createThrottledPredictor({ predict }, { now: Date.now, fallback: () => items('bank') })
  return { throttle, calls, predict }
}

describe('throttle cache, coalescing, and lifecycle', () => {
  it('coalesces final segments and calls the latest request at the next allowed time', async () => {
    const { throttle, calls } = setup()
    throttle.onFinal(request(0))
    await vi.advanceTimersByTimeAsync(1000)
    throttle.onFinal(request(1))
    await vi.advanceTimersByTimeAsync(1000)
    throttle.onFinal(request(2))
    await vi.advanceTimersByTimeAsync(2999)
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls.map(c => [c.at, c.request.transcriptTail])).toEqual([[0, 'segment 0'], [5000, 'segment 2']])
    throttle.stop()
  })

  it('returns an exact cache hit immediately and copies results', async () => {
    const { throttle, calls } = setup()
    throttle.onFinal(request())
    await vi.advanceTimersByTimeAsync(650)
    const cached = await throttle.onHelp(request())
    cached[0].word = 'changed'
    expect(await throttle.onHelp(request())).toEqual(items('segment 0'))
    expect(calls).toHaveLength(1)
  })

  it('keys caches by the actual help request, including bank/n/place changes', async () => {
    const { throttle, calls } = setup(0)
    for (const req of [request(), { ...request(), n: 1 }, { ...request(), bank: [] },
      { ...request(), place: { lat: 0, lon: 0, label: 'Park' } }]) {
      const pending = throttle.onHelp(req)
      await settle()
      await pending
    }
    expect(calls).toHaveLength(4)
  })

  it('deduplicates simultaneous help taps and shares an in-flight prefetch', async () => {
    const { throttle, calls } = setup()
    throttle.onFinal(request())
    await settle()
    const a = throttle.onHelp(request())
    const b = throttle.onHelp(request())
    await vi.advanceTimersByTimeAsync(650)
    expect(await a).toEqual(await b)
    expect(calls).toHaveLength(1)
  })

  it('records empty results once rather than repeatedly prefetching an idle transcript', async () => {
    start()
    const predict = vi.fn(async () => [])
    const throttle = createThrottledPredictor({ predict }, { now: Date.now })
    throttle.onFinal(request())
    await vi.advanceTimersByTimeAsync(120_000)
    expect(predict).toHaveBeenCalledOnce()
    expect(await throttle.onHelp(request())).toEqual([])
    expect(predict).toHaveBeenCalledTimes(2) // Cache has expired; one live call.
    expect(vi.getTimerCount()).toBe(0)
  })

  it('snapshots requests and ignores a slower old response when updating the cache', async () => {
    start()
    const resolves: Array<(items: Suggestion[]) => void> = []
    const predict = vi.fn(() => new Promise<Suggestion[]>(resolve => resolves.push(resolve)))
    const throttle = createThrottledPredictor({ predict }, { now: Date.now })
    const req = request(0)
    const old = throttle.onHelp(req)
    req.transcriptTail = 'mutated'
    const current = throttle.onHelp(request(1))
    await settle()
    expect(predict.mock.calls).toHaveLength(2)
    resolves[1](items('new'))
    await current
    resolves[0](items('old'))
    await old
    expect(await throttle.onHelp(request(1))).toEqual(items('new'))
    expect(predict).toHaveBeenCalledTimes(2)
  })

  it('never waits on quota: stale cache then bank fallback, including with no final yet', async () => {
    start()
    const predict = vi.fn(async () => items())
    const throttle = createThrottledPredictor({ predict }, { now: Date.now, limit: 1, reserve: 1, fallback: () => items('bank') })
    expect(await throttle.onHelp()).toEqual([])
    expect(await throttle.onHelp(request(0))).toEqual(items())
    expect(await throttle.onHelp(request(1))).toEqual(items())
    expect(predict).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    const empty = createThrottledPredictor({ predict: async () => [] }, {
      now: Date.now, limit: 1, reserve: 1, fallback: () => items('bank'),
    })
    expect(await empty.onHelp(request(0))).toEqual([])
    expect(await empty.onHelp(request(1))).toEqual(items('bank'))
  })

  it('catches a rejected predictor and does not retry the same final indefinitely', async () => {
    start()
    const predict = vi.fn(async () => { throw new Error('offline') })
    const throttle = createThrottledPredictor({ predict }, { now: Date.now, fallback: () => items('bank') })
    throttle.onFinal(request())
    await vi.advanceTimersByTimeAsync(100_000)
    expect(predict).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stop cancels timers, aborts work and discards late results', async () => {
    const { throttle, calls } = setup()
    const pending = throttle.onHelp(request())
    await settle()
    throttle.onFinal(request(1))
    throttle.stop()
    expect(calls[0].signal?.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(100_000)
    expect(await pending).toEqual([])
    throttle.onFinal(request(2))
    expect(await throttle.onHelp(request(2))).toEqual([])
    expect(calls).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stop before the first timer runs prevents any calls', async () => {
    const { throttle, calls } = setup()
    throttle.onFinal(request())
    throttle.stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(calls).toHaveLength(0)
  })
})

type Event = { tMs: number; type: 'final' | 'help'; seq: number }
const stream = (finalEveryMs: number, tapEveryMs: number, durationMs: number): Event[] => [
  ...Array.from({ length: Math.ceil(durationMs / finalEveryMs) }, (_, seq) => ({ tMs: seq * finalEveryMs, type: 'final' as const, seq })),
  ...Array.from({ length: Math.floor((durationMs - 1) / tapEveryMs) }, (_, i) => ({ tMs: (i + 1) * tapEveryMs, type: 'help' as const, seq: 0 })),
]
const maxInWindow = (times: number[]) => {
  let max = 0, left = 0
  for (let right = 0; right < times.length; right++) {
    while (times[right] - times[left] >= 60_000) left++
    max = Math.max(max, right - left + 1)
  }
  return max
}

async function simulate(events: Event[], durationMs: number, otherTrafficPerMin = 0) {
  start()
  const own: number[] = [], hits: number[] = [], waits: number[] = []
  let limited = 0
  const fetch = vi.fn(async () => {
    const t = Date.now()
    own.push(t)
    while (hits.length && hits[0] <= t - 60_000) hits.shift()
    if (hits.length >= 15) {
      limited++
      return new Response('{"retryDelay":"19s"}', { status: 429 })
    }
    hits.push(t)
    await new Promise(resolve => setTimeout(resolve, 650))
    return new Response(JSON.stringify([{ word: 'mug', confidence: 0.8 }]))
  })
  const predictor = createPredictor({ endpoint: '/predict', fetch: fetch as typeof globalThis.fetch, now: Date.now })
  const throttle = createThrottledPredictor(predictor, { now: Date.now })
  if (otherTrafficPerMin) for (let t = 0; t < durationMs; t += 60_000 / otherTrafficPerMin) {
    setTimeout(() => hits.push(Date.now()), t)
  }
  let taps = 0
  for (const event of events) setTimeout(() => {
    if (event.type === 'final') throttle.onFinal(request(event.seq))
    else {
      taps++
      const start = Date.now()
      void throttle.onHelp().then(() => waits.push(Date.now() - start))
    }
  }, event.tMs)
  await vi.advanceTimersByTimeAsync(durationMs)
  throttle.stop()
  await vi.advanceTimersByTimeAsync(1200)
  expect(waits).toHaveLength(taps)
  expect(Math.max(0, ...waits)).toBeLessThanOrEqual(650)
  expect(maxInWindow(own)).toBeLessThanOrEqual(15)
  expect(vi.getTimerCount()).toBe(0)
  return { own, limited }
}

describe('S-2 throttle scenarios', () => {
  it.each([
    ['busy conversation', 2000, 10_000], ['worst case', 1000, 4000],
  ])('%s: 10 minutes, no self-caused 429 and help within one call', async (_name, finalMs, tapMs) => {
    const { limited } = await simulate(stream(finalMs, tapMs, 600_000), 600_000)
    expect(limited).toBe(0)
  }, 20_000)

  it('prefetch alone stays at 12/min and leaves 3 slots for help', async () => {
    const { own } = await simulate(stream(1000, 1_000_000, 180_000), 180_000)
    expect(maxInWindow(own)).toBeLessThanOrEqual(12)
    expect(own.slice(1).every((t, i) => t - own[i] >= 5000)).toBe(true)
    start()
    const predict = vi.fn(async () => items())
    const throttle = createThrottledPredictor({ predict }, { now: Date.now })
    for (let i = 0; i < 12; i++) {
      throttle.onFinal(request(i))
      await vi.advanceTimersByTimeAsync(i === 11 ? 0 : 5000)
    }
    expect(predict).toHaveBeenCalledTimes(12)
    for (let i = 12; i < 16; i++) await throttle.onHelp(request(i))
    expect(predict).toHaveBeenCalledTimes(15)
    expect(throttle.windowCount()).toBe(15)
    throttle.stop()
  })

  it('shared quota (+6/min): backs off after external 429, taps stay responsive', async () => {
    const { limited } = await simulate(stream(1500, 8000, 300_000), 300_000, 6)
    expect(limited).toBeGreaterThan(0)
  }, 20_000)

  it('replays all eleven conversation fixtures with help taps at annotated stalls', async () => {
    const fixtures = import.meta.glob<{ events: Array<{ type: string; isFinal?: boolean; tMs: number }>; stalls: Array<{ tMs: number }> }>(
      '../../../fixtures/conversations/*.json', { eager: true, import: 'default' })
    const events: Event[] = []
    let offset = 0, seq = 0
    for (const [, fixture] of Object.entries(fixtures).sort(([a], [b]) => a.localeCompare(b))) {
      for (const e of fixture.events) if (e.type === 'transcript' && e.isFinal) events.push({ type: 'final', tMs: offset + e.tMs, seq: seq++ })
      for (const s of fixture.stalls) events.push({ type: 'help', tMs: offset + s.tMs + 800, seq: 0 })
      offset += fixture.events.at(-1)!.tMs + 2000
    }
    expect(Object.keys(fixtures)).toHaveLength(11)
    expect((await simulate(events, offset)).limited).toBe(0)
  }, 20_000)

  it('shares a real service cooldown with the prefetch scheduler', async () => {
    start()
    const fetch = vi.fn(async () => new Response('{"retryDelay":"19s"}', { status: 429 }))
    const predictor = createPredictor({ endpoint: '/predict', fetch: fetch as typeof globalThis.fetch, now: Date.now })
    const throttle = createThrottledPredictor(predictor, { now: Date.now })
    throttle.onFinal(request(0))
    await settle()
    expect(rateLimitedUntil(predictor)).toBe(19_000)
    throttle.onFinal(request(1))
    await vi.advanceTimersByTimeAsync(18_999)
    await throttle.onHelp(request(1))
    expect(fetch).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetch).toHaveBeenCalledTimes(2)
    throttle.stop()
  })
})

describe('early prediction (T-311)', () => {
  it('starts a call at once, skipping the 5 s gap, and the help that follows shares or hits it', async () => {
    const { throttle, calls } = setup()
    throttle.onFinal(request(0))
    await vi.advanceTimersByTimeAsync(1000)
    const early = throttle.onFinal(request(1), true)
    expect(early).toBeInstanceOf(Promise)
    await settle()
    expect(calls.map(c => [c.at, c.request.transcriptTail])).toEqual([[0, 'segment 0'], [1000, 'segment 1']])
    const shared = throttle.onHelp(request(1)) // in flight
    await vi.advanceTimersByTimeAsync(650)
    expect(await shared).toEqual(items('segment 1'))
    expect(await throttle.onHelp(request(1))).toEqual(items('segment 1')) // cache hit
    expect(calls).toHaveLength(2)
    throttle.stop()
  })

  it('a non-early final still waits for the gap', async () => {
    const { throttle, calls } = setup()
    throttle.onFinal(request(0))
    await vi.advanceTimersByTimeAsync(1000)
    expect(throttle.onFinal(request(1), false)).toBeUndefined()
    await vi.advanceTimersByTimeAsync(3999)
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toHaveLength(2)
    throttle.stop()
  })

  it('does not call twice for the same request', async () => {
    const { throttle, calls } = setup()
    throttle.onFinal(request(0), true)
    await settle()
    expect(throttle.onFinal(request(0), true)).toBeUndefined() // in flight
    await vi.advanceTimersByTimeAsync(650)
    expect(throttle.onFinal(request(0), true)).toBeUndefined() // cached
    expect(calls).toHaveLength(1)
    throttle.stop()
  })

  it('keeps the window cap and the tap reserve: early calls stop at limit - reserve', async () => {
    start()
    const predict = vi.fn(async () => items())
    const throttle = createThrottledPredictor({ predict }, { now: Date.now, limit: 5, reserve: 2, fallback: () => items('bank') })
    for (let i = 0; i < 3; i++) { throttle.onFinal(request(i), true); await settle() }
    expect(predict).toHaveBeenCalledTimes(3)
    expect(throttle.onFinal(request(3), true)).toBeUndefined() // falls back to the paced prefetch
    await settle()
    expect(predict).toHaveBeenCalledTimes(3)
    expect(await throttle.onHelp(request(3))).toBeTruthy() // the reserve is still there for a tap
    expect(predict).toHaveBeenCalledTimes(4)
    throttle.stop()
  })
})
