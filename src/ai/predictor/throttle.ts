import type { PredictRequest, PredictorService, Suggestion } from '../../core/types'
import { rankFallback, type SuggestionHistory } from './fallback'
import { rateLimitedUntil } from './service'
import type { AssetResolver } from './validate'

export interface ThrottleOptions {
  now: () => number
  minGapMs?: number
  windowMs?: number
  limit?: number
  reserve?: number
  cacheMaxAgeMs?: number
  resolveAssets?: AssetResolver
  fallback?: (request: PredictRequest) => Suggestion[]
}

export interface ThrottledPredictor {
  onFinal(request: PredictRequest): void
  onHelp(request?: PredictRequest): Promise<Suggestion[]>
  /** Permanently dispose on mode exit. Create a new limiter on the next enter. */
  stop(): void
  windowCount(): number
}

const positive = (value: number | undefined, fallback: number) =>
  value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback
const copy = (items: Suggestion[]) => items.map(item => ({ ...item }))

/** Section 10: coalesced prefetch and reserved help slots in a sliding window. */
export function createThrottledPredictor(predictor: PredictorService, opts: ThrottleOptions): ThrottledPredictor {
  const now = opts.now
  const minGapMs = positive(opts.minGapMs, 5000)
  const windowMs = positive(opts.windowMs, 60_000)
  const limit = Math.max(1, Math.floor(positive(opts.limit, 15)))
  const reserve = Math.min(limit, Math.max(0, Math.floor(
    opts.reserve !== undefined && Number.isFinite(opts.reserve) ? opts.reserve : 3)))
  const prefetchCap = limit - reserve
  const cacheMaxAgeMs = positive(opts.cacheMaxAgeMs, 60_000)
  const calls: number[] = []
  const history: SuggestionHistory = new Map()
  let stopped = false
  let sequence = 0
  let settledSequence = 0
  let latest: { request: PredictRequest; key: string; seq: number } | undefined
  let cache: { key: string; seq: number; items: Suggestion[]; at: number } | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const pending = new Map<string, { controller: AbortController; result: Promise<Suggestion[]> }>()

  const prune = () => { while (calls.length && calls[0] <= now() - windowMs) calls.shift() }
  const clearTimer = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined }
  const fallback = (request: PredictRequest) => {
    try { return copy(opts.fallback ? opts.fallback(request) : rankFallback(request, history, now(), opts.resolveAssets)) }
    catch { return [] }
  }
  const remember = (items: Suggestion[]) => {
    for (const item of items) {
      const key = item.word.toLocaleLowerCase('en')
      history.delete(key)
      history.set(key, now())
    }
    while (history.size > 200) history.delete(history.keys().next().value!)
    return copy(items)
  }
  const select = (request: PredictRequest) => {
    // Snapshot before scheduling, so caller mutation cannot change a queued call
    // or make a cached result appear to belong to a different request.
    const snapshot = structuredClone(request)
    const key = JSON.stringify([snapshot.transcriptTail, snapshot.stalledAfter, snapshot.bank, snapshot.place, snapshot.n])
    if (!latest || latest.key !== key) {
      latest = { request: snapshot, key, seq: ++sequence }
      clearTimer()
    }
    return latest
  }

  function arm() {
    if (stopped || timer !== undefined || !latest || latest.seq <= settledSequence || pending.size || !prefetchCap) return
    prune()
    const roomAt = calls.length < prefetchCap ? now() : calls[calls.length - prefetchCap] + windowMs
    const at = Math.max(now(), (calls.at(-1) ?? -Infinity) + minGapMs, roomAt, rateLimitedUntil(predictor))
    timer = setTimeout(() => {
      timer = undefined
      if (stopped || !latest) return
      prune()
      // A help tap may have consumed a slot since this timer was armed.
      if (now() < rateLimitedUntil(predictor) || calls.length >= prefetchCap ||
          now() < (calls.at(-1) ?? -Infinity) + minGapMs || pending.size) return arm()
      void call(latest)
    }, Math.max(0, at - now()))
  }

  function call(target: NonNullable<typeof latest>): Promise<Suggestion[]> {
    const existing = pending.get(target.key)
    if (existing) return existing.result
    calls.push(now()) // Reserve synchronously; simultaneous taps share this quota.
    const controller = new AbortController()
    // Install the promise before invoking an arbitrary service implementation.
    const result = Promise.resolve().then(() => stopped ? [] : predictor.predict(target.request, controller.signal))
      .catch(() => fallback(target.request))
      .then(items => {
        if (stopped) return []
        settledSequence = Math.max(settledSequence, target.seq)
        if (!cache || target.seq >= cache.seq) cache = { key: target.key, seq: target.seq, items: copy(items), at: now() }
        return copy(items)
      }).finally(() => { pending.delete(target.key); arm() })
    pending.set(target.key, { controller, result })
    return result
  }

  return {
    onFinal(request) {
      if (stopped) return
      select(request)
      arm()
    },
    async onHelp(request) {
      if (stopped) return []
      const target = request ? select(request) : latest
      if (!target) return []
      if (cache?.key === target.key && now() - cache.at <= cacheMaxAgeMs) return remember(cache.items)
      const inFlight = pending.get(target.key)
      if (inFlight) return remember(await inFlight.result)
      prune()
      if (now() >= rateLimitedUntil(predictor) && calls.length < limit) {
        clearTimer()
        return remember(await call(target))
      }
      return remember(cache?.items.length ? cache.items : fallback(target.request))
    },
    stop() {
      stopped = true
      clearTimer()
      for (const { controller } of pending.values()) controller.abort()
      latest = undefined
      cache = undefined
      history.clear()
    },
    windowCount() { prune(); return calls.length },
  }
}
