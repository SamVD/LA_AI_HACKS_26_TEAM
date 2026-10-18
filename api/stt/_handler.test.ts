import { describe, expect, it, vi } from 'vitest'
import { createTokenHandler, parseOrigins } from './_handler'

const KEY = 'sk_test_never_leaks_0123456789'
const ORIGIN = 'http://localhost:5173'

function setup(o: Partial<Parameters<typeof createTokenHandler>[0]> = {}, mint: () => Response | Promise<Response> = () => Response.json({ token: 'sutkn_abc' })) {
  const lines: string[] = []
  const upstream = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => mint())
  const handle = createTokenHandler({
    apiKey: KEY, allowedOrigins: [ORIGIN], fetch: upstream as unknown as typeof fetch, log: l => lines.push(l), ...o,
  })
  return { handle, upstream, lines }
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://nudge.example/api/stt/token', {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

describe('api/stt token handler', () => {
  it('mints a token with the server-side key and returns only the token', async () => {
    const { handle, upstream, lines } = setup()
    const res = await handle(post({ type: 'batch_scribe' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ token: 'sutkn_abc' })
    expect(text).not.toContain(KEY)
    const [url, init] = upstream.mock.calls[0]
    expect(String(url)).toBe('https://api.elevenlabs.io/v1/single-use-token/batch_scribe')
    expect((init!.headers as Record<string, string>)['xi-api-key']).toBe(KEY)
    expect(lines.join('\n')).not.toContain(KEY)
    expect(lines.join('\n')).not.toContain('sutkn_abc')
  })

  it('accepts realtime_scribe', async () => {
    const { handle, upstream } = setup()
    expect((await handle(post({ type: 'realtime_scribe' }))).status).toBe(200)
    expect(String(upstream.mock.calls[0][0])).toMatch(/realtime_scribe$/)
  })

  it('answers the CORS preflight for an allowed origin', async () => {
    const { handle, upstream } = setup()
    const res = await handle(new Request('https://nudge.example/api/stt/token', { method: 'OPTIONS', headers: { origin: ORIGIN } }))
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-methods')).toContain('POST')
    expect(upstream).not.toHaveBeenCalled()
  })

  it('rejects other origins without minting, and logs only the origin', async () => {
    const { handle, upstream, lines } = setup()
    const res = await handle(post({ type: 'batch_scribe' }, { origin: 'https://evil.example' }))
    expect(res.status).toBe(403)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(upstream).not.toHaveBeenCalled()
    expect(lines).toEqual(['stt-token: rejected origin "https://evil.example"'])
  })

  it('handles a missing Origin per allowMissingOrigin, and the literal "null" origin via the list', async () => {
    const noOrigin = new Request('https://nudge.example/api/stt/token', { method: 'POST', body: '{"type":"batch_scribe"}' })
    expect((await setup().handle(noOrigin.clone())).status).toBe(403)
    expect((await setup({ allowMissingOrigin: true }).handle(noOrigin.clone())).status).toBe(200)
    expect((await setup({ allowedOrigins: ['null'] }).handle(post({ type: 'batch_scribe' }, { origin: 'null' }))).status).toBe(200)
  })

  it.each([
    ['unknown type', { type: 'tts_websocket' }, 400],
    ['missing type', {}, 400],
    ['invalid json', '{nope', 400],
    ['oversized body', JSON.stringify({ type: 'batch_scribe', pad: 'x'.repeat(400) }), 413],
  ])('rejects %s', async (_l, body, status) => {
    const { handle, upstream } = setup()
    expect((await handle(post(body))).status).toBe(status)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('rejects other methods', async () => {
    const { handle } = setup()
    expect((await handle(new Request('https://nudge.example/api/stt/token', { method: 'GET', headers: { origin: ORIGIN } }))).status).toBe(405)
  })

  it('rate-limits per IP', async () => {
    let t = 0
    const { handle } = setup({ rateLimit: { max: 3, windowMs: 60_000 }, now: () => t })
    for (let i = 0; i < 3; i++) expect((await handle(post({ type: 'batch_scribe' }))).status).toBe(200)
    expect((await handle(post({ type: 'batch_scribe' }))).status).toBe(429)
    expect((await handle(post({ type: 'batch_scribe' }, { 'x-forwarded-for': '5.6.7.8' }))).status).toBe(200)
    t = 61_000
    expect((await handle(post({ type: 'batch_scribe' }))).status).toBe(200)
  })

  it('returns 502 when ElevenLabs refuses or is unreachable, without leaking details', async () => {
    const refused = setup({}, () => new Response(JSON.stringify({ detail: { message: 'invalid key' } }), { status: 401 }))
    const r1 = await refused.handle(post({ type: 'batch_scribe' }))
    expect(r1.status).toBe(502)
    expect(await r1.json()).toEqual({ error: 'mint failed' })
    expect(refused.lines).toEqual(['stt-token: mint failed with http 401'])

    const down = setup({}, () => { throw new TypeError('fetch failed') })
    expect((await down.handle(post({ type: 'batch_scribe' }))).status).toBe(502)
  })

  it('returns 500 when the key is not configured', async () => {
    const { handle, upstream } = setup({ apiKey: undefined })
    expect((await handle(post({ type: 'batch_scribe' }))).status).toBe(500)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('parses the origin list from env', () => {
    expect(parseOrigins(' http://a:1, null ,,http://b ')).toEqual(['http://a:1', 'null', 'http://b'])
    expect(parseOrigins(undefined)).toEqual([])
  })
})
