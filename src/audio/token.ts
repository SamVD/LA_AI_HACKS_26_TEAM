import type { SttErrorCode } from '../core/types'

// Single-use ElevenLabs tokens from our api/stt minter (D3). Tokens live 15 min
// and are consumed on use, so we keep exactly one fresh token ready: `take()`
// hands it over and immediately starts minting the next one, which hides the
// mint round trip (~100-250 ms) from the next utterance.

export type TokenType = 'batch_scribe' | 'realtime_scribe'
export type TokenResult = { ok: true; token: string } | { ok: false; error: SttErrorCode; detail: string }

export interface TokenProviderOptions {
  /** Full URL of `POST /api/stt/token`. */
  url: string
  type?: TokenType
  fetch?: typeof fetch
  now?: () => number
  /** Treat a cached token as stale after this long (tokens expire at 15 min). */
  ttlMs?: number
  timeoutMs?: number
}

export class TokenProvider {
  private readonly type: TokenType
  private readonly fetchFn: typeof fetch
  private readonly now: () => number
  private readonly ttlMs: number
  private readonly timeoutMs: number
  private ready: { token: string; at: number } | null = null
  private inflight: Promise<TokenResult> | null = null

  constructor(private readonly o: TokenProviderOptions) {
    this.type = o.type ?? 'batch_scribe'
    this.fetchFn = o.fetch ?? ((...a) => fetch(...a))
    this.now = o.now ?? Date.now
    this.ttlMs = o.ttlMs ?? 12 * 60_000
    this.timeoutMs = o.timeoutMs ?? 3000
  }

  /** Start minting in the background if no fresh token is cached. Never throws. */
  prime(): void {
    if (this.fresh() || this.inflight) return
    void this.mint()
  }

  /** A fresh token (cached or newly minted). Primes the next one on success. */
  async take(): Promise<TokenResult> {
    // Two passes: the second covers a concurrent take() that consumed the token we waited on.
    for (let pass = 0; pass < 2 && !this.fresh(); pass++) {
      const r = await (this.inflight ?? this.mint())
      if (!r.ok) return r
    }
    if (!this.fresh()) return { ok: false, error: 'unknown', detail: 'token race' }
    const token = this.ready!.token
    this.ready = null
    this.prime()
    return { ok: true, token }
  }

  private fresh(): boolean {
    return !!this.ready && this.now() - this.ready.at < this.ttlMs
  }

  private mint(): Promise<TokenResult> {
    // Only the request that set `inflight` may clear it, and only after it is set: clearing it
    // in the request's own `finally` could run first (a synchronous failure) and leave
    // `inflight` stuck on a settled promise, after which nothing would ever mint again.
    const p: Promise<TokenResult> = (async (): Promise<TokenResult> => {
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), this.timeoutMs)
      try {
        const res = await this.fetchFn(this.o.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type: this.type }),
          signal: ac.signal,
        })
        if (!res.ok) return { ok: false, error: 'unknown', detail: `token http ${res.status}` }
        const body = await res.json().catch(() => null) as { token?: unknown } | null
        if (typeof body?.token !== 'string' || !body.token) return { ok: false, error: 'unknown', detail: 'token missing' }
        this.ready = { token: body.token, at: this.now() }
        return { ok: true, token: body.token }
      } catch (e) {
        const aborted = (e as { name?: string })?.name === 'AbortError'
        return { ok: false, error: aborted ? 'timeout' : 'network', detail: aborted ? 'token timeout' : 'token fetch failed' }
      } finally {
        clearTimeout(timer)
      }
    })()
    this.inflight = p
    void p.then(() => { if (this.inflight === p) this.inflight = null })
    return p
  }
}
