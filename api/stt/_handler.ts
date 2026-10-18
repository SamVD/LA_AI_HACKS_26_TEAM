// Single-use ElevenLabs token minter (D3). No audio ever passes through here.
//
//   POST /api/stt/token  {"type":"batch_scribe"|"realtime_scribe"}  ->  200 {"token":"sutkn_..."}
//
// Holds ELEVENLABS_API_KEY from the host's env. Origin allow-list, per-IP rate
// limit, tiny bodies only. Never logs the key or tokens.
// Port of spikes/stt/token-server.mjs. Web-standard Request/Response, no dependencies.

import { clientIp, corsHeaders, createOriginCheck, createRateLimiter, jsonResponse, readBody } from '../_shared.js'

export { originMatches, parseOrigins } from '../_shared.js'

export const TOKEN_TYPES = ['batch_scribe', 'realtime_scribe'] as const
export type TokenType = (typeof TOKEN_TYPES)[number]

export interface TokenHandlerOptions {
  apiKey: string | undefined
  /** Allowed origins: exact (`http://localhost:5173`), `scheme://host:*` for any port on that host (`http://127.0.0.1:*`, the Even app), `*` for any (dev only), `null` for the literal "null" origin. */
  allowedOrigins: string[]
  /** Accept requests that carry no Origin header (native WebViews may omit it). */
  allowMissingOrigin?: boolean
  rateLimit?: { max: number; windowMs: number }
  fetch?: typeof fetch
  now?: () => number
  log?: (line: string) => void
  elevenLabsBase?: string
}

const MAX_BODY_BYTES = 256

export function createTokenHandler(o: TokenHandlerOptions): (req: Request) => Promise<Response> {
  const fetchFn = o.fetch ?? ((...a) => fetch(...a))
  const log = o.log ?? (() => {})
  const originOk = createOriginCheck(o.allowedOrigins, o.allowMissingOrigin)
  const limited = createRateLimiter({ ...(o.rateLimit ?? { max: 30, windowMs: 60_000 }), now: o.now ?? Date.now })

  return async function handle(req: Request): Promise<Response> {
    const origin = req.headers.get('origin')
    if (!originOk(origin)) {
      log(`stt-token: rejected origin ${JSON.stringify(origin)}`) // origin only; add it to STT_ALLOWED_ORIGINS if legitimate
      return jsonResponse(403, { error: 'origin not allowed' })
    }
    const cors = corsHeaders(origin)
    const json = (status: number, body: unknown, extra: Record<string, string> = {}) => jsonResponse(status, body, { ...cors, ...extra })
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (req.method !== 'POST') return json(405, { error: 'method not allowed' })

    const waitMs = limited(clientIp(req))
    if (waitMs) return json(429, { error: 'rate_limited', retryDelayMs: waitMs }, { 'retry-after': String(Math.ceil(waitMs / 1000)) })

    const raw = await readBody(req, MAX_BODY_BYTES)
    if (raw === null) return json(413, { error: 'body too large' })
    let type: unknown
    try { type = (JSON.parse(raw || '{}') as { type?: unknown }).type } catch { return json(400, { error: 'invalid json' }) }
    if (!TOKEN_TYPES.includes(type as TokenType)) return json(400, { error: 'type must be batch_scribe or realtime_scribe' })

    if (!o.apiKey) {
      log('stt-token: ELEVENLABS_API_KEY is not set')
      return json(500, { error: 'not configured' })
    }
    try {
      const res = await fetchFn(`${o.elevenLabsBase ?? 'https://api.elevenlabs.io'}/v1/single-use-token/${type}`, {
        method: 'POST',
        headers: { 'xi-api-key': o.apiKey },
      })
      const body = await res.json().catch(() => null) as { token?: unknown } | null
      if (!res.ok || typeof body?.token !== 'string') {
        log(`stt-token: mint failed with http ${res.status}`)
        return json(502, { error: 'mint failed' })
      }
      return json(200, { token: body.token })
    } catch {
      log('stt-token: mint request failed')
      return json(502, { error: 'mint failed' })
    }
  }
}
