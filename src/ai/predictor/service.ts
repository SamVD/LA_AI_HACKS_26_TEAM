import type { PredictRequest, PredictorService, Suggestion, WordEntry } from '../../core/types'
import { rankFallback, type SuggestionHistory } from './fallback'
import { toWireRequest } from './input'
import { type AssetResolver, validateModelOutput } from './validate'

export type FallbackReason = 'timeout' | 'network' | 'http' | 'rate-limited' | 'invalid' | 'unconfigured'

// Local metadata shared with the limiter without changing the frozen service contract.
const cooldowns = new WeakMap<PredictorService, () => number>()
export const rateLimitedUntil = (predictor: PredictorService) => cooldowns.get(predictor)?.() ?? 0

function retryDelayMs(response: Response, body: string, now: number): number {
  const header = response.headers.get('retry-after')
  const seconds = header?.trim() ? Number(header) : NaN
  const date = header && !Number.isFinite(seconds) ? Date.parse(header) : NaN
  const delay = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/)?.[1]
  // Missing/malformed hints still back off; use the longest valid server hint.
  const hints = [Number.isFinite(seconds) ? seconds * 1000 : 0,
    Number.isFinite(date) ? date - now : 0, delay ? Number(delay) * 1000 : 0]
    .filter(value => Number.isFinite(value) && value > 0)
  return hints.length ? Math.max(...hints) : 20_000
}

export interface PredictorOptions {
  /** Full URL of T-203's api/predict. Without it every call uses the bank-only fallback. */
  endpoint?: string
  fetch?: typeof fetch
  /** End-to-end budget, PREDICTOR_PROMPT.md Section 2. */
  timeoutMs?: number
  now?: () => number
  log?: (event: string, data?: unknown) => void
  resolveAssets?: AssetResolver
  /** Drop bank entries tagged `sample` (Section 4: production builds). */
  dropSamples?: boolean
}

const HISTORY_CAP = 200

/**
 * PredictorService over api/predict (T-203). Never rejects: on timeout, network
 * failure, a non-2xx status (429 included, never retried) or invalid output it
 * returns bank-only suggestions. An aborted caller signal resolves with [].
 */
export function createPredictor(options: PredictorOptions = {}): PredictorService {
  const {
    endpoint,
    timeoutMs = 1200,
    now = () => Date.now(),
    log = () => {},
    resolveAssets,
    dropSamples = false,
  } = options
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args))
  const history: SuggestionHistory = new Map()
  let blockedUntil = 0

  function remember(items: Suggestion[]) {
    const t = now()
    for (const s of items) {
      const key = s.word.toLocaleLowerCase('en')
      history.delete(key)
      history.set(key, t)
    }
    while (history.size > HISTORY_CAP) history.delete(history.keys().next().value as string)
    return items
  }

  function fallback(req: PredictRequest, reason: FallbackReason, startedAt: number, extra: Record<string, unknown> = {}) {
    const items = rankFallback(req, history, now(), resolveAssets)
    log('predictor.fallback', { reason, ms: now() - startedAt, ...extra, words: items.map(s => s.word) })
    return remember(items)
  }

  async function run(request: PredictRequest, signal?: AbortSignal): Promise<Suggestion[]> {
    const startedAt = now()
    const bank: WordEntry[] = dropSamples ? request.bank.filter(e => !e.tags.includes('sample')) : request.bank
    const req = { ...request, bank }
    if (!endpoint) return fallback(req, 'unconfigured', startedAt)
    if (now() < blockedUntil) return fallback(req, 'rate-limited', startedAt, { blockedUntil })

    const controller = new AbortController()
    let timedOut = false
    let rejectAbort: (reason: Error) => void = () => {}
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject })
    const rejectOnAbort = () => rejectAbort(new Error('aborted'))
    controller.signal.addEventListener('abort', rejectOnAbort, { once: true })
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const res = await Promise.race([doFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(toWireRequest(req)),
        signal: controller.signal,
      }), aborted])
      if (signal?.aborted) return []
      if (res.status === 429) {
        // Start the cooldown before reading the body, even if it hangs or fails.
        const receivedAt = now()
        const previousBlock = blockedUntil
        const provisional = receivedAt + retryDelayMs(res, '', receivedAt)
        blockedUntil = Math.max(blockedUntil, provisional)
        let text = ''
        try { text = await Promise.race([res.text(), aborted]) } catch { /* Keep the header/default cooldown. */ }
        if (signal?.aborted) return []
        // Prefer the server's actual delay to the provisional default.
        blockedUntil = Math.max(blockedUntil === provisional ? previousBlock : blockedUntil,
          receivedAt + retryDelayMs(res, text, receivedAt))
        return fallback(req, 'rate-limited', startedAt, { status: 429, blockedUntil })
      }
      if (!res.ok) return fallback(req, 'http', startedAt, { status: res.status })
      const text = await Promise.race([res.text(), aborted])
      if (signal?.aborted) return []
      const v = validateModelOutput(text, req, resolveAssets)
      if (v.invalid) return fallback(req, 'invalid', startedAt, { why: v.invalid, dropped: v.dropped })
      log('predictor.model', { ms: now() - startedAt, dropped: v.dropped, words: v.items.map(s => s.word) })
      return remember(v.items)
    } catch {
      if (signal?.aborted) return []
      return fallback(req, timedOut ? 'timeout' : 'network', startedAt)
    } finally {
      clearTimeout(timer)
      controller.signal.removeEventListener('abort', rejectOnAbort)
      signal?.removeEventListener('abort', onAbort)
    }
  }

  const predictor: PredictorService = {
    async predict(request, signal) {
      if (signal?.aborted) return []
      try {
        return await run(request, signal)
      } catch (e) {
        // Never reject, even on a bug in validation or fallback.
        log('predictor.error', { error: String(e) })
        return []
      }
    },
  }
  cooldowns.set(predictor, () => blockedUntil)
  return predictor
}
