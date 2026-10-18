// Reference predict throttle for the free Gemini tier (S-2 finding R5).
//
// Measured limit: 15 generateContent requests per minute, per project, per model
// (429 quotaId GenerateRequestsPerMinutePerProjectPerModel-FreeTier, quotaValue 15).
// Extra API keys in the same project do not add capacity.
//
// Policy:
//   - Speculative prefetch (on each final transcript segment) is a trailing-edge throttle:
//     at most one call per `minGapMs`, always using the LATEST transcript, and only while the
//     sliding-window count is below `limit - reserve`. Segments that arrive in between are coalesced.
//   - A help tap uses the cache if it was built from the current transcript (instant). Otherwise it
//     calls the model if the window still has room (the `reserve` slots exist for this), else it
//     returns the cached or fallback suggestions immediately. A tap never waits on the limiter.
//   - A 429 blocks all calls until its retryDelay has passed. It is never retried inside the 1.2 s budget.
//
// Pure: time and timers are injected, so the policy is checkable with a fake clock
// (throttle-check.mjs). T-201 ports this into src/ai/predictor/. Do not import from spikes/.

export function createPredictThrottle({
  predict, // async (req) => { items, rateLimitedMs? }  (never rejects; the 1.2 s timeout lives inside)
  fallback, // (req) => items, synchronous, bank-only
  now = () => Date.now(),
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (h) => clearTimeout(h),
  limit = 15,
  windowMs = 60_000,
  reserve = 3, // slots kept free for help taps
  minGapMs = 5_000, // 12 prefetches/min max, which leaves the reserve unused by prefetch
}) {
  const calls = [] // timestamps of model calls in the current window
  let blockedUntil = 0
  let latest = null // latest final-segment request
  let latestSeq = 0
  let timer = null
  let cache = null // { seq, items, at }
  const stats = { prefetch: 0, help: 0, helpCacheHit: 0, helpLive: 0, helpFallback: 0, rateLimited: 0, coalesced: 0 }

  const prune = (t) => { while (calls.length && calls[0] <= t - windowMs) calls.shift() }
  const used = (t) => (prune(t), calls.length)
  // earliest time the window has room for one more call under `cap`
  const roomAt = (t, cap) => (used(t) < cap ? t : calls[calls.length - cap] + windowMs)

  async function call(req, seq) {
    calls.push(now())
    const r = await predict(req)
    if (r.rateLimitedMs) { stats.rateLimited++; blockedUntil = Math.max(blockedUntil, now() + r.rateLimitedMs) }
    if (r.items?.length && (!cache || seq >= cache.seq)) cache = { seq, items: r.items, at: now() }
    return r
  }

  function arm() {
    if (timer || !latest || (cache && cache.seq === latestSeq)) return
    const t = now()
    const lastPrefetch = calls.length ? calls[calls.length - 1] : -Infinity
    const at = Math.max(t, lastPrefetch + minGapMs, blockedUntil, roomAt(t, limit - reserve))
    timer = schedule(async () => {
      timer = null
      const t2 = now()
      if (t2 < blockedUntil || used(t2) >= limit - reserve) return arm()
      stats.prefetch++
      await call(latest, latestSeq)
      arm() // a newer segment may have arrived while the call was in flight
    }, at - t)
  }

  return {
    stats,
    /** Call on every final transcript segment with a fresh PredictRequest. */
    onFinal(req) {
      if (timer) stats.coalesced++
      latest = req
      latestSeq++
      arm()
    },
    /** Help tap. Resolves fast: cache, a live call inside the window, or fallback. */
    async onHelp(req = latest) {
      stats.help++
      if (cache && cache.seq === latestSeq) { stats.helpCacheHit++; return { items: cache.items, from: 'cache' } }
      const t = now()
      if (t >= blockedUntil && used(t) < limit) {
        stats.helpLive++
        const r = await call(req, latestSeq)
        if (r.items?.length) return { items: r.items, from: 'live' }
      }
      stats.helpFallback++
      return cache ? { items: cache.items, from: 'stale-cache' } : { items: fallback(req), from: 'fallback' }
    },
    /** Mode exit: drop pending work. */
    stop() { if (timer) cancel(timer); timer = null },
    /** For checks: calls currently in the sliding window. */
    windowCount: () => used(now()),
  }
}
