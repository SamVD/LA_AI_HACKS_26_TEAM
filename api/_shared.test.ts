import { describe, expect, it } from 'vitest'
import { clientIp, corsHeaders, createOriginCheck, createRateLimiter, jsonResponse, originMatches, parseOrigins, readBody } from './_shared'

describe('originMatches', () => {
  // G1 (real G2): the Even app serves the packaged build from a local server, so the WebView's
  // Origin is http://127.0.0.1:<port>, and the port changes per launch (61976, 62029, 62047 seen).
  it.each([
    ['http://127.0.0.1:61976', 'http://127.0.0.1:*', true],
    ['http://127.0.0.1:1', 'http://127.0.0.1:*', true],
    ['http://127.0.0.1:61976', 'http://127.0.0.1:61976', true],
    ['http://localhost:5173', 'http://localhost:5173', true],
    ['http://127.0.0.1', 'http://127.0.0.1:*', false], // no port
    ['http://127.0.0.1:abc', 'http://127.0.0.1:*', false],
    ['http://127.0.0.1:123456', 'http://127.0.0.1:*', false],
    ['http://127.0.0.1.evil.com:80', 'http://127.0.0.1:*', false], // lookalike host
    ['https://127.0.0.1:61976', 'http://127.0.0.1:*', false], // other scheme
    ['http://127.0.0.10:61976', 'http://127.0.0.1:*', false],
    ['http://localhost:61976', 'http://127.0.0.1:*', false],
    ['https://evil.example', '*', true], // dev wildcard
  ] as const)('%s vs %s -> %s', (origin, entry, ok) => {
    expect(originMatches(origin, entry)).toBe(ok)
  })
})

describe('createOriginCheck', () => {
  it('applies the allow-list, and a missing Origin only when allowed', () => {
    const check = createOriginCheck(parseOrigins('http://localhost:5173, http://127.0.0.1:*'))
    expect(check('http://127.0.0.1:62047')).toBe(true)
    expect(check('null')).toBe(false) // the literal "null" origin needs its own entry
    expect(check(null)).toBe(false)
    expect(createOriginCheck([], true)(null)).toBe(true)
    expect(createOriginCheck(['null'])('null')).toBe(true)
  })

  it('parses the env list, trimming blanks', () => {
    expect(parseOrigins(' http://a:1, null ,,http://b ')).toEqual(['http://a:1', 'null', 'http://b'])
    expect(parseOrigins(undefined)).toEqual([])
  })
})

describe('createRateLimiter', () => {
  it('allows max calls per key per window and reports when the next slot frees', () => {
    let t = 0
    const limited = createRateLimiter({ max: 2, windowMs: 60_000, now: () => t })
    expect(limited('a')).toBe(0)
    t = 10_000
    expect(limited('a')).toBe(0)
    t = 20_000
    expect(limited('a')).toBe(40_000) // the first call frees its slot at 60 s
    expect(limited('b')).toBe(0) // keys are independent
    t = 61_000
    expect(limited('a')).toBe(9_000) // refused calls count too: 10 s, 20 s, 61 s are in the window
  })
})

describe('request helpers', () => {
  const req = (body: string, headers: Record<string, string> = {}) => new Request('https://x/api', { method: 'POST', body, headers })

  it('reads a body up to maxBytes, measured in bytes', async () => {
    expect(await readBody(req('{"a":1}'), 16)).toBe('{"a":1}')
    expect(await readBody(req('x'.repeat(17)), 16)).toBeNull()
    expect(await readBody(req('é'.repeat(9)), 16)).toBeNull() // 9 characters, 18 bytes
    expect(await readBody(req('{}', { 'content-length': '999' }), 16)).toBeNull()
  })

  it('takes the first forwarded hop as the client IP', () => {
    expect(clientIp(req('', { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('1.2.3.4')
    expect(clientIp(req('', { 'x-real-ip': '5.6.7.8' }))).toBe('5.6.7.8')
    expect(clientIp(req(''))).toBe('unknown')
  })

  it('sends CORS headers only for an allowed origin, plus any extras', () => {
    expect(corsHeaders(null)).toEqual({})
    expect(corsHeaders('http://127.0.0.1:1', { 'access-control-expose-headers': 'retry-after' })).toMatchObject({
      'access-control-allow-origin': 'http://127.0.0.1:1', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'origin',
      'access-control-expose-headers': 'retry-after',
    })
  })

  it('builds no-store JSON responses', async () => {
    const r = jsonResponse(400, { error: 'x' }, { 'x-a': '1' })
    expect(r.status).toBe(400)
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(r.headers.get('x-a')).toBe('1')
    expect(await r.json()).toEqual({ error: 'x' })
  })
})
