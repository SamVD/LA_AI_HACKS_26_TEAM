// Single-use ElevenLabs token minter (D3). No audio ever passes through here.
//
//   POST /api/stt/token  {"type":"batch_scribe"|"realtime_scribe"}  ->  200 {"token":"sutkn_..."}
//
// Holds ELEVENLABS_API_KEY from the host's env. Origin allow-list, per-IP rate
// limit, tiny bodies only. Never logs the key or tokens.
// Port of spikes/stt/token-server.mjs. Web-standard Request/Response, no dependencies.

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
  const now = o.now ?? Date.now
  const log = o.log ?? (() => {})
  const { max, windowMs } = o.rateLimit ?? { max: 30, windowMs: 60_000 }
  const hits = new Map<string, number[]>() // per instance; serverless instances do not share this

  const originOk = (origin: string | null) =>
    origin === null ? !!o.allowMissingOrigin : o.allowedOrigins.some(e => originMatches(origin, e))

  const cors = (origin: string | null): Record<string, string> =>
    origin === null ? {} : {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '600',
      vary: 'origin',
    }

  const json = (status: number, body: unknown, origin: string | null) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(origin) } })

  const limited = (ip: string) => {
    const t = now()
    const recent = (hits.get(ip) ?? []).filter(x => x > t - windowMs)
    recent.push(t)
    hits.set(ip, recent)
    if (hits.size > 10_000) hits.clear() // bound memory on a long-lived instance
    return recent.length > max
  }

  return async function handle(req: Request): Promise<Response> {
    const origin = req.headers.get('origin')
    if (!originOk(origin)) {
      log(`stt-token: rejected origin ${JSON.stringify(origin)}`) // origin only; add it to STT_ALLOWED_ORIGINS if legitimate
      return json(403, { error: 'origin not allowed' }, null)
    }
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
    if (req.method !== 'POST') return json(405, { error: 'method not allowed' }, origin)

    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
    if (limited(ip)) return json(429, { error: 'rate limited' }, origin)

    const len = Number(req.headers.get('content-length') ?? 0)
    if (len > MAX_BODY_BYTES) return json(413, { error: 'body too large' }, origin)
    const raw = await req.text()
    if (raw.length > MAX_BODY_BYTES) return json(413, { error: 'body too large' }, origin)
    let type: unknown
    try { type = (JSON.parse(raw || '{}') as { type?: unknown }).type } catch { return json(400, { error: 'invalid json' }, origin) }
    if (!TOKEN_TYPES.includes(type as TokenType)) return json(400, { error: 'type must be batch_scribe or realtime_scribe' }, origin)

    if (!o.apiKey) {
      log('stt-token: ELEVENLABS_API_KEY is not set')
      return json(500, { error: 'not configured' }, origin)
    }
    try {
      const res = await fetchFn(`${o.elevenLabsBase ?? 'https://api.elevenlabs.io'}/v1/single-use-token/${type}`, {
        method: 'POST',
        headers: { 'xi-api-key': o.apiKey },
      })
      const body = await res.json().catch(() => null) as { token?: unknown } | null
      if (!res.ok || typeof body?.token !== 'string') {
        log(`stt-token: mint failed with http ${res.status}`)
        return json(502, { error: 'mint failed' }, origin)
      }
      return json(200, { token: body.token }, origin)
    } catch {
      log('stt-token: mint request failed')
      return json(502, { error: 'mint failed' }, origin)
    }
  }
}

/**
 * One allow-list entry against a request Origin. Exact match, `*` (dev only), or a
 * `scheme://host:*` entry that accepts any numeric port on that exact host. The Even app
 * serves packaged builds from a local server, so the WebView's origin is
 * `http://127.0.0.1:<port>` (G1: 61976), and the port may change per launch.
 */
export function originMatches(origin: string, entry: string): boolean {
  if (entry === '*' || entry === origin) return true
  if (!entry.endsWith(':*')) return false
  const prefix = entry.slice(0, -1) // keep the ':'
  return origin.startsWith(prefix) && /^\d{1,5}$/.test(origin.slice(prefix.length))
}

/** STT_ALLOWED_ORIGINS="http://localhost:5173,http://127.0.0.1:*,null" */
export function parseOrigins(v: string | undefined): string[] {
  return (v ?? '').split(',').map(s => s.trim()).filter(Boolean)
}
