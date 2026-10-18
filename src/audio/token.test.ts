import { describe, expect, it, vi } from 'vitest'
import { TokenProvider } from './token'

const URL = 'https://nudge.example/api/stt/token'
const ok = (token: string) => Response.json({ token })

describe('TokenProvider', () => {
  it('hands out each single-use token once and pre-mints the next', async () => {
    let n = 0
    const fetchFn = vi.fn(async () => ok(`sutkn_${++n}`))
    const p = new TokenProvider({ url: URL, fetch: fetchFn as unknown as typeof fetch })
    const a = await p.take()
    const b = await p.take()
    expect(a).toEqual({ ok: true, token: 'sutkn_1' })
    expect(b).toEqual({ ok: true, token: 'sutkn_2' })
    expect(fetchFn).toHaveBeenCalledTimes(3) // the third is the prefetch for the next utterance
  })

  it('recovers after a fetch that throws synchronously (never wedges on a settled request)', async () => {
    let calls = 0
    const fetchFn = vi.fn(() => {
      if (++calls === 1) throw new TypeError('sync failure')
      return Promise.resolve(ok('sutkn_ok'))
    })
    const p = new TokenProvider({ url: URL, fetch: fetchFn as unknown as typeof fetch })
    expect(await p.take()).toMatchObject({ ok: false, error: 'network' })
    expect(await p.take()).toEqual({ ok: true, token: 'sutkn_ok' })
  })

  it('maps HTTP errors, a missing token and timeouts to typed errors', async () => {
    const http = new TokenProvider({ url: URL, fetch: (async () => new Response('{}', { status: 403 })) as unknown as typeof fetch })
    expect(await http.take()).toMatchObject({ ok: false, error: 'unknown', detail: 'token http 403' })
    const empty = new TokenProvider({ url: URL, fetch: (async () => Response.json({})) as unknown as typeof fetch })
    expect(await empty.take()).toMatchObject({ ok: false, error: 'unknown', detail: 'token missing' })
    vi.useFakeTimers()
    try {
      const slow = new TokenProvider({
        url: URL, timeoutMs: 50,
        fetch: ((_u: string, init: RequestInit) => new Promise((_r, rej) => {
          init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))
        })) as unknown as typeof fetch,
      })
      const r = slow.take()
      await vi.advanceTimersByTimeAsync(60)
      expect(await r).toMatchObject({ ok: false, error: 'timeout' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('re-mints a cached token once it is older than ttlMs (tokens expire at 15 min)', async () => {
    let t = 0
    let n = 0
    const p = new TokenProvider({ url: URL, ttlMs: 1000, now: () => t, fetch: (async () => ok(`sutkn_${++n}`)) as unknown as typeof fetch })
    p.prime()
    await Promise.resolve()
    await new Promise(r => setTimeout(r, 0))
    t = 5000 // the primed token is stale now
    expect(await p.take()).toEqual({ ok: true, token: 'sutkn_2' })
  })
})
