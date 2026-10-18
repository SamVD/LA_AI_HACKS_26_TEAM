import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PredictRequest, WordEntry } from '../../core/types'
import words from '../../content/words.json'
import { buildModelInput, toWireRequest, trimTail } from './input'
import { validateModelOutput } from './validate'
import { rankFallback } from './fallback'
import { createPredictor } from './service'
import { type EvalCase, runEval } from './evaluate'
import evalFixture from '../../../fixtures/predictor-eval.json'

const bank = words as WordEntry[]
const entry = (word: string, category: WordEntry['category'], tags: string[] = []): WordEntry => ({
  id: word.toLowerCase().replace(/\W+/g, '-'), word, category, frames: [`A ____ ${word}.`], tags,
})
const cup = entry('cup', 'object', ['drink', 'kitchen'])
const spoon = entry('spoon', 'object', ['kitchen', 'soup'])
const maya = entry('Maya', 'person', ['daughter', 'family'])
const metformin = entry('metformin', 'medication', ['sample', 'morning'])
const smallBank = [cup, spoon, maya, metformin]
const request = (over: Partial<PredictRequest> = {}): PredictRequest => ({
  transcriptTail: 'I made tea and I need something to drink from. Pass me the',
  stalledAfter: 'pass me the',
  bank: smallBank,
  n: 3,
  ...over,
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('input building (Section 4)', () => {
  it('trims the tail to 40 words and 300 characters from the front', () => {
    const long = Array.from({ length: 60 }, (_, i) => `w${i}`).join(' ')
    expect(trimTail(long).split(' ')).toHaveLength(40)
    expect(trimTail(long).split(' ')[0]).toBe('w20')
    const wide = Array.from({ length: 30 }, () => 'abcdefghijklmn').join(' ')
    expect(trimTail(wide).length).toBeLessThanOrEqual(300)
    expect(trimTail(wide).startsWith('abcdefghijklmn')).toBe(true)
  })

  it('sends a slim request: personal first, no frames or ids, place label only, n clamped', () => {
    const wire = toWireRequest(request({ place: { lat: 34.1, lon: -118.4, label: 'Home kitchen' }, n: 9 }))
    expect(wire.bank.map(e => e.word)).toEqual(['Maya', 'metformin', 'cup', 'spoon'])
    expect(Object.keys(wire.bank[0]).sort()).toEqual(['category', 'tags', 'word'])
    expect(wire.place).toEqual({ label: 'Home kitchen' })
    expect(JSON.stringify(wire)).not.toMatch(/34\.1|-118/)
    expect(wire.n).toBe(5)
    expect(toWireRequest(request({ place: { lat: 1, lon: 2 } })).place).toBeUndefined()
  })

  it('caps the bank at 150 and fits the proxy 16 KB limit with the full fixture bank', () => {
    const many = Array.from({ length: 200 }, (_, i) => entry(`word${i}`, 'object', ['tag']))
    expect(toWireRequest(request({ bank: many })).bank).toHaveLength(150)
    expect(JSON.stringify(toWireRequest(request({ bank: [...bank, ...many] }))).length).toBeLessThan(16 * 1024)
  })

  it('builds the model turn with the [STALL] marker', () => {
    const input = buildModelInput(toWireRequest(request({ place: { lat: 0, lon: 0, label: 'Park' } })))
    expect(input.transcript.endsWith('Pass me the [STALL]')).toBe(true)
    expect(Object.keys(input)).toEqual(['transcript', 'stalledAfter', 'bank', 'place', 'n'])
  })
})

describe('client validation (Section 6)', () => {
  const resolve = (e: WordEntry) => ({ imageKey: `img:${e.id}`, mouthKey: 'mouth:back' })
  const v = (raw: unknown, over: Partial<PredictRequest> = {}) =>
    validateModelOutput(typeof raw === 'string' ? raw : JSON.stringify(raw), request(over), resolve)

  it('rejects unparseable and non-array output as a whole', () => {
    expect(v('not json').invalid).toBe('parse')
    expect(v({ word: 'cup', confidence: 0.9 }).invalid).toBe('not-array')
    expect(v([]).invalid).toBe('empty')
  })

  it('drops malformed items and keeps the rest', () => {
    const r = v([{ word: 'cup', confidence: 0.9 }, { word: 7, confidence: 0.5 }, { word: 'mug' }, { word: 'glass', confidence: NaN }, null, 'cup'])
    expect(r.items.map(s => s.word)).toEqual(['cup'])
    expect(r.dropped).toBe(5)
  })

  it('cleans words: quotes, punctuation, articles, spacing; keeps "Dr." and non-Latin letters', () => {
    const r = v([
      { word: '  "The   mug." ', confidence: 0.5 },
      { word: 'Dr. Velrin', confidence: 0.4 },
      { word: 'José', confidence: 0.3 },
      { word: 'an apple!', confidence: 0.2 },
    ], { n: 5 })
    expect(r.items.map(s => s.word)).toEqual(['mug', 'Dr. Velrin', 'José', 'apple'])
  })

  it('rejects long, multi-word, digit, stop-word and repeated-last-word items', () => {
    const r = v([
      { word: 'a very long phrase here', confidence: 0.9 },
      { word: 'x'.repeat(41), confidence: 0.9 },
      { word: 'cup2', confidence: 0.9 },
      { word: 'um', confidence: 0.9 },
      { word: 'thing', confidence: 0.9 },
      { word: 'The', confidence: 0.9 },
      { word: 'cup', confidence: 0.1 },
    ], { stalledAfter: 'pass me the' })
    expect(r.items.map(s => s.word)).toEqual(['cup'])
    expect(v([{ word: 'Cuh', confidence: 0.9 }, { word: 'cup', confidence: 0.5 }], { stalledAfter: 'no, a cuh' }).items.map(s => s.word)).toEqual(['cup'])
  })

  it('clamps confidence, dedupes case and simple plurals keeping the higher one, sorts and takes n', () => {
    const r = v([
      { word: 'cups', confidence: 0.4 },
      { word: 'CUP', confidence: 1.7 },
      { word: 'mug', confidence: -2 },
      { word: 'glass', confidence: 0.3 },
      { word: 'bowl', confidence: 0.2 },
    ])
    expect(r.items.map(s => [s.word, s.confidence])).toEqual([['cup', 1], ['glass', 0.3], ['bowl', 0.2]])
    expect(r.dropped).toBe(1)
  })

  it('uses bank spelling and source, and takes asset keys only from the resolver', () => {
    const r = v([{ word: 'maya', confidence: 0.8, imageKey: 'evil', mouthKey: 'evil' }, { word: 'umbrella', confidence: 0.7 }])
    expect(r.items[0]).toEqual({ word: 'Maya', confidence: 0.8, source: 'bank', imageKey: 'img:maya', mouthKey: 'mouth:back' })
    expect(r.items[1]).toMatchObject({ word: 'umbrella', source: 'model', imageKey: 'img:umbrella' })
  })
})

describe('bank-only fallback (Section 7)', () => {
  it('scores tag overlap and category fit, capped at 0.6 confidence', () => {
    const items = rankFallback(request({ transcriptTail: 'Time for my morning dose. I need to take my', stalledAfter: 'take my' }))
    expect(items[0]).toMatchObject({ word: 'metformin', source: 'bank' })
    expect(items[0].confidence).toBeCloseTo(0.15 * 1.5)
    // Four tag hits reach the confidence cap without boosting an already-said word.
    const ladle = entry('ladle', 'object', ['kitchen', 'soup', 'pot', 'serve'])
    const many = rankFallback(request({ transcriptTail: 'kitchen soup pot serve soup', bank: [ladle] }))
    expect(many[0].confidence).toBe(0.6)
  })

  it('treats a person after "call" or "my daughter" as a category fit', () => {
    expect(rankFallback(request({ transcriptTail: 'I should call', stalledAfter: 'I should call' }))[0].word).toBe('Maya')
  })

  it('adds recency for words suggested in the last 5 minutes only', () => {
    const history = new Map([['spoon', 1_000]])
    const r = request({ transcriptTail: 'nothing related at all', stalledAfter: 'all' })
    expect(rankFallback(r, history, 1_000 + 4 * 60_000)[0]).toMatchObject({ word: 'spoon', confidence: 0.075 })
    expect(rankFallback(r, history, 1_000 + 6 * 60_000)).toEqual([])
  })

  it('returns [] when nothing scores, including expired personal suggestions', () => {
    const r = request({ transcriptTail: 'nothing related at all', stalledAfter: 'all' })
    expect(rankFallback(r)).toEqual([])
    expect(rankFallback(r, new Map([['metformin', 10]]), 10 + 10 * 60_000)).toEqual([])
    expect(rankFallback({ ...r, bank: [] })).toEqual([])
  })

  it('improves the v1 baseline on the eval fixtures', async () => {
    const { summary } = await runEval((evalFixture as { cases: EvalCase[] }).cases, bank, async r => rankFallback(r))
    expect(summary.n).toBe(31)
    expect(summary.top1).toBeGreaterThan(0.32)
    expect(summary.top3).toBeGreaterThanOrEqual(0.64)
  })
})

describe('createPredictor (api/predict client)', () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  /** A fetch that never answers until its signal aborts, like a hung proxy. */
  const hanging = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
  }))
  const setup = (fetchImpl: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>, extra = {}) => {
    const log = vi.fn()
    const fetch = vi.fn(fetchImpl)
    const predictor = createPredictor({ endpoint: 'https://proxy.test/api/predict', fetch: fetch as typeof globalThis.fetch, log, ...extra })
    return { predictor, fetch, log, reasons: () => log.mock.calls.filter(c => c[0] === 'predictor.fallback').map(c => c[1].reason) }
  }

  it('POSTs the slim request and returns validated model suggestions', async () => {
    const { predictor, fetch, log } = setup(async () => ok([{ word: 'Cup', confidence: 0.9 }, { word: 'mug', confidence: 0.4 }]))
    const items = await predictor.predict(request({ place: { lat: 1, lon: 2, label: 'Kitchen' } }))
    expect(items.map(s => [s.word, s.source])).toEqual([['cup', 'bank'], ['mug', 'model']])
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://proxy.test/api/predict')
    expect(init?.method).toBe('POST')
    const body = JSON.parse(String(init?.body))
    expect(body.bank[0]).toEqual({ word: 'Maya', category: 'person', tags: ['daughter', 'family'] })
    expect(body.place).toEqual({ label: 'Kitchen' })
    expect(log).toHaveBeenCalledWith('predictor.model', expect.objectContaining({ words: ['cup', 'mug'] }))
  })

  it('falls back on HTTP errors, including 429, without retrying', async () => {
    const { predictor, fetch, log, reasons } = setup(async () => new Response('slow down', { status: 429 }))
    const items = await predictor.predict(request())
    expect(items[0].source).toBe('bank')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(reasons()).toEqual(['rate-limited'])
    expect(log.mock.calls[0][1]).toMatchObject({ status: 429 })
  })

  it('falls back on invalid model output and on network errors', async () => {
    const bad = setup(async () => ok({ not: 'an array' }))
    expect((await bad.predictor.predict(request())).length).toBeGreaterThan(0)
    expect(bad.reasons()).toEqual(['invalid'])
    const down = setup(async () => { throw new TypeError('Failed to fetch') })
    expect((await down.predictor.predict(request()))[0].source).toBe('bank')
    expect(down.reasons()).toEqual(['network'])
  })

  it('falls back after the 1.2 s timeout', async () => {
    vi.useFakeTimers()
    const { predictor, reasons } = setup(hanging)
    const pending = predictor.predict(request())
    await vi.advanceTimersByTimeAsync(1199)
    expect(reasons()).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect((await pending)[0].source).toBe('bank')
    expect(reasons()).toEqual(['timeout'])
  })

  it('resolves [] when the caller aborts, before or during the call', async () => {
    const { predictor, fetch, reasons } = setup(hanging)
    const pre = new AbortController()
    pre.abort()
    expect(await predictor.predict(request(), pre.signal)).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
    const mid = new AbortController()
    const pending = predictor.predict(request(), mid.signal)
    mid.abort()
    expect(await pending).toEqual([])
    expect(reasons()).toEqual([])
  })

  it('uses the fallback when no endpoint is configured', async () => {
    const log = vi.fn()
    const items = await createPredictor({ log }).predict(request())
    expect(items[0].word).toBe('cup')
    expect(log).toHaveBeenCalledWith('predictor.fallback', expect.objectContaining({ reason: 'unconfigured' }))
  })

  it('drops sample entries when asked, for both the request and the fallback', async () => {
    const { predictor, fetch } = setup(async () => ok([{ word: 'cup', confidence: 0.9 }]), { dropSamples: true })
    await predictor.predict(request())
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).bank.map((e: WordEntry) => e.word)).not.toContain('metformin')
    const local = createPredictor({ dropSamples: true })
    expect((await local.predict(request({ transcriptTail: 'take my', stalledAfter: 'take my' }))).map(s => s.word)).not.toContain('metformin')
  })

  it('remembers its suggestions for fallback recency', async () => {
    let t = 0
    const { predictor } = setup(async () => ok([{ word: 'spoon', confidence: 0.9 }]), { now: () => t })
    await predictor.predict(request())
    const offline = setup(async () => { throw new TypeError('offline') }, { now: () => t })
    t = 60_000
    expect((await predictor.predict(request({ transcriptTail: 'nothing related', stalledAfter: 'related' })))[0].word).toBe('spoon')
    expect(await offline.predictor.predict(request({ transcriptTail: 'nothing related', stalledAfter: 'related' }))).toEqual([])
  })

  it('never rejects, even if asset resolution throws', async () => {
    const log = vi.fn()
    const predictor = createPredictor({ log, resolveAssets: () => { throw new Error('boom') } })
    await expect(predictor.predict(request())).resolves.toEqual([])
    expect(log).toHaveBeenCalledWith('predictor.error', expect.anything())
  })
})
