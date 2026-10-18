// Helpers shared by the api/ functions (api/stt/token, api/predict). The name starts
// with "_", so Vercel does not deploy this file as a function. Web-standard only.

/**
 * One allow-list entry against a request Origin. Exact match, `*` (dev only), or a
 * `scheme://host:*` entry that accepts any numeric port on that exact host. The Even app
 * serves packaged builds from a local server, so the WebView's origin is
 * `http://127.0.0.1:<port>` (61976 at G1), and the port changes per launch.
 */
export function originMatches(origin: string, entry: string): boolean {
  if (entry === '*' || entry === origin) return true
  if (!entry.endsWith(':*')) return false
  const prefix = entry.slice(0, -1) // keep the ':'
  return origin.startsWith(prefix) && /^\d{1,5}$/.test(origin.slice(prefix.length))
}

/** `STT_ALLOWED_ORIGINS="http://localhost:5173,http://127.0.0.1:*"` → entries. */
export function parseOrigins(v: string | undefined): string[] {
  return (v ?? '').split(',').map(s => s.trim()).filter(Boolean)
}

/**
 * The origin policy: an allow-list match, or no Origin header at all when `allowMissing`.
 * Origins can be forged outside a browser, so this stops other websites, not scripts;
 * the rate limit is the backstop.
 */
export function createOriginCheck(allowed: string[], allowMissing = false): (origin: string | null) => boolean {
  return origin => (origin === null ? allowMissing : allowed.some(e => originMatches(origin, e)))
}

/** CORS headers for an allowed origin; none for a rejected or missing one. */
export function corsHeaders(origin: string | null, extra: Record<string, string> = {}): Record<string, string> {
  if (origin === null) return {}
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '600',
    vary: 'origin',
    ...extra,
  }
}

/** The caller's IP: the first x-forwarded-for hop (Vercel sets it), else x-real-ip. */
export function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
}

/**
 * A sliding-window limit per key. Returns 0 when the call is allowed, else the ms until a
 * slot frees (for Retry-After). Every call counts, refused ones too. Per serverless
 * instance, so best effort; memory is bounded.
 */
export function createRateLimiter(o: { max: number; windowMs: number; now: () => number }): (key: string) => number {
  const hits = new Map<string, number[]>()
  return key => {
    const t = o.now()
    const recent = (hits.get(key) ?? []).filter(x => x > t - o.windowMs)
    recent.push(t)
    hits.set(key, recent)
    if (hits.size > 10_000) hits.clear()
    return recent.length > o.max ? recent[recent.length - o.max - 1] + o.windowMs - t : 0
  }
}

/** The request body as text, or null when it is over `maxBytes` (Content-Length first, then the real size). */
export async function readBody(req: Request, maxBytes: number): Promise<string | null> {
  if (Number(req.headers.get('content-length') ?? 0) > maxBytes) return null
  const raw = await req.text()
  return new TextEncoder().encode(raw).byteLength > maxBytes ? null : raw
}

/** A JSON Response with no-store caching. */
export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } })
}
