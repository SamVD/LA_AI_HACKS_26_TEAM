import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PredictRequest } from '../../core/types'
import { createPredictor, rateLimitedUntil } from './service'

const request: PredictRequest = { transcriptTail: 'unrelated', stalledAfter: 'the', bank: [], n: 3 }
const start = () => { vi.useFakeTimers(); vi.setSystemTime(0) }
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

describe('HTTP cooldowns and request deadlines', () => {
  it.each([
    ['{"retryDelay":"19s"}', {}, 19_000],
    ['{"error":{"details":[{"retryDelay":"2.5s"}]}}', {}, 2500],
    ['bad body', { 'retry-after': '7' }, 7000],
    ['{"retryDelay":"2s"}', { 'retry-after': '7' }, 7000],
    ['bad body', { 'retry-after': 'Thu, 01 Jan 1970 00:00:09 GMT' }, 9000],
    ['{"retryDelay":"0s"}', { 'retry-after': '-1' }, 20_000],
    ['bad body', {}, 20_000],
  ])('honors server cooldown: %s %j', async (body, headers, delay) => {
    start()
    const fetch = vi.fn(async () => new Response(body, { status: 429, headers }))
    const log = vi.fn()
    const predictor = createPredictor({ endpoint: '/predict', fetch: fetch as typeof globalThis.fetch, now: Date.now, log })
    await predictor.predict(request)
    expect(rateLimitedUntil(predictor)).toBe(delay)
    expect(fetch).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(delay - 1)
    await predictor.predict(request)
    expect(fetch).toHaveBeenCalledOnce()
    expect(log).toHaveBeenCalledWith('predictor.fallback', expect.objectContaining({ reason: 'rate-limited' }))
    await vi.advanceTimersByTimeAsync(1)
    await predictor.predict(request)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('other HTTP errors use the http fallback and do not trigger a cooldown', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 503 }))
    const log = vi.fn()
    const predictor = createPredictor({ endpoint: '/predict', fetch: fetch as typeof globalThis.fetch, log })
    await predictor.predict(request)
    await predictor.predict(request)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(rateLimitedUntil(predictor)).toBe(0)
    expect(log).toHaveBeenCalledWith('predictor.fallback', expect.objectContaining({ reason: 'http', status: 503 }))
  })

  it('bounds fetch even when it ignores abort signals', async () => {
    start()
    const fetch = vi.fn(() => new Promise<Response>(() => {}))
    const log = vi.fn()
    const predictor = createPredictor({ endpoint: '/predict', fetch: fetch as typeof globalThis.fetch, log })
    const pending = predictor.predict(request)
    await vi.advanceTimersByTimeAsync(1200)
    expect(await pending).toEqual([])
    expect(log).toHaveBeenCalledWith('predictor.fallback', expect.objectContaining({ reason: 'timeout' }))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds hung bodies and discards model output that arrives after timeout', async () => {
    start()
    let resolveBody: (text: string) => void = () => {}
    const response = new Response('')
    vi.spyOn(response, 'text').mockImplementation(() => new Promise(resolve => { resolveBody = resolve }))
    const log = vi.fn()
    const predictor = createPredictor({ endpoint: '/predict', fetch: (async () => response) as typeof fetch, log })
    const pending = predictor.predict(request)
    await vi.advanceTimersByTimeAsync(1200)
    expect(await pending).toEqual([])
    resolveBody('[{"word":"mug","confidence":0.8}]')
    await vi.advanceTimersByTimeAsync(0)
    expect(log.mock.calls.some(call => call[0] === 'predictor.model')).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps a 429 cooldown when reading the error body stalls', async () => {
    start()
    const response = new Response('', { status: 429, headers: { 'retry-after': '7' } })
    vi.spyOn(response, 'text').mockImplementation(() => new Promise(() => {}))
    const fetch = vi.fn(async () => response)
    const predictor = createPredictor({ endpoint: '/predict', fetch: fetch as typeof globalThis.fetch, now: Date.now })
    const pending = predictor.predict(request)
    await vi.advanceTimersByTimeAsync(1200)
    expect(await pending).toEqual([])
    expect(rateLimitedUntil(predictor)).toBe(7000)
    await predictor.predict(request)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('caller abort resolves promptly even if fetch ignores its signal', async () => {
    start()
    const controller = new AbortController()
    const log = vi.fn()
    const predictor = createPredictor({ endpoint: '/predict', fetch: (() => new Promise(() => {})) as typeof fetch, log })
    const pending = predictor.predict(request, controller.signal)
    controller.abort()
    expect(await pending).toEqual([])
    expect(log).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
