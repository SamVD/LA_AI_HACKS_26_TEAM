// api/predict (T-203): holds the Gemini key and turns a PredictWireRequest into one
// generateContent call per docs/PREDICTOR_PROMPT.md v2. Returns the model's raw JSON
// text; the client (src/ai/predictor, T-201) validates it again and falls back on
// any non-2xx. Web-standard Request/Response, no dependencies.
//
// Responses
//   200  model JSON text (an array of {word, confidence}), unvalidated by design (Section 5)
//   400  malformed request, 403 origin, 405 method, 413 over 16 KB
//   429  {error:'rate_limited', retryDelayMs} + Retry-After (seconds): Gemini's free-tier
//        quota (15/min/model) or our per-IP limit. The client throttle backs off; never retry inline.
//   502  upstream error or empty output, 504 upstream timeout, 500 key not configured
// Every response carries Server-Timing (gemini;dur, total;dur) so the client can measure the hop.

import type { WordCategory } from '../../src/core/types'
import { buildModelInput, MAX_BANK, type PredictWireRequest } from '../../src/ai/predictor/input.js'
import { EXAMPLES, PROMPT_VERSION, RESPONSE_SCHEMA, SYSTEM_PROMPT } from './_prompt.js'

/** Section 2: pinned by S-2. Don't use gemini-flash-latest (moves, ~7x slower, rejects minimal thinking). */
export const MODEL = 'gemini-3.5-flash-lite'
export const MAX_BODY_BYTES = 16 * 1024
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const CATEGORIES = new Set<WordCategory>(['object', 'food', 'person', 'place', 'medication', 'other'])

export interface PredictHandlerOptions {
  apiKey: string | undefined
  /** Exact origins; `*` allows any (dev only); `null` matches the literal "null" origin. */
  allowedOrigins: string[]
  allowMissingOrigin?: boolean
  /** Per-IP cap, above the client throttle's 15/min so it only stops abuse. */
  rateLimit?: { max: number; windowMs: number }
  upstreamTimeoutMs?: number
  fetch?: typeof fetch
  now?: () => number
  log?: (line: string) => void
  geminiBase?: string
}

// --- request validation --------------------------------------------------------

type Parsed = { ok: true; req: PredictWireRequest } | { ok: false; error: string }
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max

/** Rebuilds the request from known fields only, so nothing else reaches the model. */
export function parseWireRequest(raw: unknown): Parsed {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'body must be a JSON object' }
  const r = raw as Record<string, unknown>
  if (!str(r.transcriptTail, 4000) || !r.transcriptTail.trim()) return { ok: false, error: 'transcriptTail must be a non-empty string' }
  if (!str(r.stalledAfter, 400)) return { ok: false, error: 'stalledAfter must be a string' }
  if (!Array.isArray(r.bank)) return { ok: false, error: 'bank must be an array' }
  const bank: PredictWireRequest['bank'] = []
  for (const e of r.bank.slice(0, MAX_BANK)) {
    const x = e as Record<string, unknown> | null
    if (!x || !str(x.word, 60) || !x.word.trim() || !CATEGORIES.has(x.category as WordCategory)) return { ok: false, error: 'bad bank entry' }
    if (!Array.isArray(x.tags) || x.tags.length > 20 || !x.tags.every(t => str(t, 40))) return { ok: false, error: 'bad bank tags' }
    bank.push({ word: x.word, category: x.category as WordCategory, tags: [...(x.tags as string[])] })
  }
  const n = typeof r.n === 'number' ? r.n : 3
  const req: PredictWireRequest = { transcriptTail: r.transcriptTail, stalledAfter: r.stalledAfter, bank, n }
  const label = (r.place as { label?: unknown } | undefined)?.label
  if (str(label, 120) && label.trim()) req.place = { label: label.trim() }
  return { ok: true, req }
}

/** The generateContent body (Section 2): system prompt, Examples 1-7 as turns, then the real turn. */
export function buildGeminiBody(req: PredictWireRequest) {
  const contents = EXAMPLES.flatMap(ex => [
    { role: 'user', parts: [{ text: JSON.stringify(ex.input) }] },
    { role: 'model', parts: [{ text: JSON.stringify(ex.output) }] },
  ])
  contents.push({ role: 'user', parts: [{ text: JSON.stringify(buildModelInput(req)) }] })
  return {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 128,
      thinkingConfig: { thinkingLevel: 'minimal' },
    },
  }
}

/** Gemini's 429 carries RetryInfo.retryDelay like "19s". */
export function retryDelayMs(errorBody: unknown, fallbackMs = 20_000): number {
  const details = (errorBody as { error?: { details?: Array<{ retryDelay?: unknown }> } } | null)?.error?.details ?? []
  for (const d of details) {
    const m = typeof d.retryDelay === 'string' ? d.retryDelay.match(/^(\d+(?:\.\d+)?)s$/) : null
    if (m) return Math.ceil(Number(m[1]) * 1000)
  }
  return fallbackMs
}

// --- handler ---------------------------------------------------------------------

export function createPredictHandler(o: PredictHandlerOptions): (req: Request) => Promise<Response> {
  const fetchFn = o.fetch ?? ((...a) => fetch(...a))
  const now = o.now ?? Date.now
  const log = o.log ?? (() => {})
  const { max, windowMs } = o.rateLimit ?? { max: 30, windowMs: 60_000 }
  const hits = new Map<string, number[]>() // per instance; serverless instances do not share this

  const originOk = (origin: string | null) =>
    origin === null ? !!o.allowMissingOrigin : o.allowedOrigins.includes('*') || o.allowedOrigins.includes(origin)

  const cors = (origin: string | null): Record<string, string> =>
    origin === null ? {} : {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-expose-headers': 'retry-after, server-timing',
      'access-control-max-age': '600',
      'timing-allow-origin': origin,
      vary: 'origin',
    }

  return async function handle(req: Request): Promise<Response> {
    const t0 = now()
    const origin = req.headers.get('origin')
    let geminiMs: number | null = null
    const respond = (status: number, body: string, extra: Record<string, string> = {}) =>
      new Response(body, {
        status,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store',
          'server-timing': `${geminiMs === null ? '' : `gemini;dur=${geminiMs}, `}total;dur=${now() - t0}`,
          'x-prompt-version': String(PROMPT_VERSION),
          ...cors(originOk(origin) ? origin : null),
          ...extra,
        },
      })
    const json = (status: number, body: unknown, extra?: Record<string, string>) => respond(status, JSON.stringify(body), extra)
    const rateLimited = (ms: number) => json(429, { error: 'rate_limited', retryDelayMs: ms }, { 'retry-after': String(Math.ceil(ms / 1000)) })

    if (!originOk(origin)) {
      log(`predict: rejected origin ${JSON.stringify(origin)}`) // add it to PREDICT_ALLOWED_ORIGINS if legitimate
      return json(403, { error: 'origin not allowed' })
    }
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
    if (req.method !== 'POST') return json(405, { error: 'method not allowed' })

    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
    const recent = (hits.get(ip) ?? []).filter(x => x > t0 - windowMs)
    recent.push(t0)
    hits.set(ip, recent)
    if (hits.size > 10_000) hits.clear()
    if (recent.length > max) return rateLimited(recent[recent.length - max - 1] + windowMs - t0)

    if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return json(413, { error: 'body over 16 KB' })
    const raw = await req.text()
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json(413, { error: 'body over 16 KB' })
    let body: unknown
    try { body = JSON.parse(raw) } catch { return json(400, { error: 'invalid json' }) }
    const parsed = parseWireRequest(body)
    if (!parsed.ok) return json(400, { error: parsed.error })

    if (!o.apiKey) {
      log('predict: GEMINI_API_KEY is not set')
      return json(500, { error: 'not configured' })
    }

    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), o.upstreamTimeoutMs ?? 5000)
    try {
      const g0 = now()
      const res = await fetchFn(`${o.geminiBase ?? GEMINI_BASE}/models/${MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': o.apiKey },
        body: JSON.stringify(buildGeminiBody(parsed.req)),
        signal: ac.signal,
      })
      const out = await res.json().catch(() => null) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> }; finishReason?: string }>
      } | null
      geminiMs = now() - g0
      if (res.status === 429) {
        const ms = retryDelayMs(out)
        log(`predict: gemini 429, retry in ${ms} ms`)
        return rateLimited(ms)
      }
      if (!res.ok) {
        log(`predict: gemini http ${res.status}`)
        return json(502, { error: 'upstream', status: res.status })
      }
      const cand = out?.candidates?.[0]
      const text = (cand?.content?.parts ?? []).filter(p => !p.thought).map(p => p.text ?? '').join('').trim()
      if (!text) {
        log(`predict: empty output (finishReason ${cand?.finishReason ?? 'none'})`)
        return json(502, { error: 'empty output' })
      }
      return respond(200, text)
    } catch (e) {
      const aborted = (e as { name?: string })?.name === 'AbortError'
      log(`predict: gemini ${aborted ? 'timeout' : 'request failed'}`)
      return json(aborted ? 504 : 502, { error: aborted ? 'upstream timeout' : 'upstream unreachable' })
    } finally {
      clearTimeout(timer)
    }
  }
}

export function parseOrigins(v: string | undefined): string[] {
  return (v ?? '').split(',').map(s => s.trim()).filter(Boolean)
}
