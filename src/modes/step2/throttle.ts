// Local stand-in for T-201's `createThrottledPredictor` (PLAN D11,
// PREDICTOR_PROMPT §10), with the same two methods the mode uses. Ported from
// spikes/predictor/throttle.mjs minus 429 handling (PredictorService never
// rejects and does not report rate limits). Swap the import in ./index.ts for
// `src/ai/predictor` once T-201 part 2 merges, then delete this file.
import type { PredictRequest, PredictorService, Suggestion } from '../../core/types'

export interface ThrottledPredictor {
  /** Every final transcript segment: trailing-edge prefetch, ≤1 call per `minGapMs`, latest request wins. */
  onFinal(req: PredictRequest): void
  /** Help tap: the cache if it was built from the latest request, else a live call if the window allows, else the stale cache. Never waits on the limiter. */
  onHelp(req?: PredictRequest): Promise<Suggestion[]>
  /** Mode exit: drop pending prefetches. */
  stop(): void
}

export interface ThrottleOptions {
  now: () => number
  limit?: number
  windowMs?: number
  /** Slots per window kept free for help taps. */
  reserve?: number
  minGapMs?: number
}

export function createThrottledPredictor(predictor: PredictorService, opts: ThrottleOptions): ThrottledPredictor {
  const { now, limit = 15, windowMs = 60_000, reserve = 3, minGapMs = 5_000 } = opts
  const calls: number[] = []
  let latest: PredictRequest | null = null
  let latestSeq = 0
  let cache: { seq: number; items: Suggestion[] } | null = null
  // The newest request a call has finished for, even with an empty answer. The
  // spike only tracked non-empty answers, so an empty one was re-fetched every
  // `minGapMs` (wasting quota) and delayed the prefetch for the next segment.
  let fetchedSeq = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  let lastPrefetch = -Infinity

  const used = (t: number) => {
    while (calls.length && calls[0] <= t - windowMs) calls.shift()
    return calls.length
  }
  const roomAt = (t: number, cap: number) => (used(t) < cap ? t : calls[calls.length - cap] + windowMs)

  async function call(req: PredictRequest, seq: number): Promise<Suggestion[]> {
    calls.push(now())
    const items = await predictor.predict(req)
    fetchedSeq = Math.max(fetchedSeq, seq)
    if (items.length && (!cache || seq >= cache.seq)) cache = { seq, items }
    return items
  }

  function arm() {
    if (stopped || timer || !latest || fetchedSeq === latestSeq) return
    const t = now()
    const at = Math.max(t, lastPrefetch + minGapMs, roomAt(t, limit - reserve))
    timer = setTimeout(async () => {
      timer = null
      if (stopped || !latest) return
      if (used(now()) >= limit - reserve) { arm(); return }
      lastPrefetch = now()
      await call(latest, latestSeq)
      arm() // a newer segment may have arrived while the call was in flight
    }, at - t)
  }

  return {
    onFinal(req) {
      latest = req
      latestSeq++
      arm()
    },
    async onHelp(req = latest ?? undefined) {
      if (cache && cache.seq === latestSeq) return cache.items
      if (req && used(now()) < limit) {
        const items = await call(req, latestSeq)
        if (items.length) return items
      }
      return cache?.items ?? []
    },
    stop() {
      stopped = true
      if (timer) clearTimeout(timer)
      timer = null
    },
  }
}
