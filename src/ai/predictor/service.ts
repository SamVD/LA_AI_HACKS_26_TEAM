import type { PredictRequest, PredictorService, Suggestion, WordEntry } from '../../core/types'
import { rankFallback, type SuggestionHistory } from './fallback'
import { toWireRequest } from './input'
import { type AssetResolver, validateModelOutput } from './validate'

export type FallbackReason = 'timeout' | 'network' | 'http' | 'invalid' | 'unconfigured'

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

    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const res = await doFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(toWireRequest(req)),
        signal: controller.signal,
      })
      if (!res.ok) return fallback(req, 'http', startedAt, { status: res.status })
      const text = await res.text()
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
      signal?.removeEventListener('abort', onAbort)
    }
  }

  return {
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
}
