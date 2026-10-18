import { describe, expect, it, vi } from 'vitest'
import { orderBank, toWireRequest } from '../../src/ai/predictor/input'
import type { WordEntry } from '../../src/core/types'
import { createPredictHandler, MAX_BODY_BYTES, MODEL, parseOrigins, parseWireRequest, retryDelayMs } from './_handler'
import { EXAMPLES, SYSTEM_PROMPT } from './_prompt'

const KEY = 'AQ.test_key_never_leaks_0123456789'
const ORIGIN = 'http://localhost:5173'
const MODEL_JSON = '[{"word":"cup","confidence":0.8},{"word":"mug","confidence":0.1}]'

const bank: WordEntry[] = [
  { id: 'cup', word: 'cup', category: 'object', frames: ['A ____.'], tags: ['kitchen', 'drink'] },
  { id: 'p-maya', word: 'Maya', category: 'person', frames: ['____.'], tags: ['family', 'daughter'] },
]
// Built exactly the way the T-201 client builds it.
const wire = toWireRequest({ transcriptTail: 'I am thirsty, pass me the', stalledAfter: 'pass me the', bank, place: { lat: 34.07, lon: -118.44, label: 'Home kitchen' }, n: 3 })

function gemini200(text = MODEL_JSON) {
  return Response.json({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] })
}

function setup(o: Partial<Parameters<typeof createPredictHandler>[0]> = {}, upstream: (url: string, init: RequestInit) => Response | Promise<Response> = () => gemini200()) {
  const lines: string[] = []
  const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => upstream(String(url), init!))
  const handle = createPredictHandler({ apiKey: KEY, allowedOrigins: [ORIGIN], fetch: fetchFn as unknown as typeof fetch, log: l => lines.push(l), ...o })
  return { handle, fetchFn, lines }
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://nudge.example/api/predict', {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

describe('api/predict', () => {
  it('returns the model JSON text unchanged, with CORS and Server-Timing', async () => {
    const { handle, lines } = setup()
    const res = await handle(post(wire))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe(MODEL_JSON)
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(res.headers.get('access-control-expose-headers')).toContain('server-timing')
    expect(res.headers.get('server-timing')).toMatch(/^gemini;dur=\d+, total;dur=\d+$/)
    expect(res.headers.get('x-prompt-version')).toBe('2')
    expect(lines).toEqual([])
  })

  it('calls the pinned model with the key in a header and the v2 request shape', async () => {
    const { handle, fetchFn } = setup()
    await handle(post(wire))
    const [url, init] = fetchFn.mock.calls[0]
    expect(String(url)).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`)
    expect(MODEL).toBe('gemini-3.5-flash-lite')
    expect(String(url)).not.toContain(KEY)
    expect((init!.headers as Record<string, string>)['x-goog-api-key']).toBe(KEY)

    const body = JSON.parse(init!.body as string)
    expect(body.systemInstruction.parts[0].text).toBe(SYSTEM_PROMPT)
    expect(body.generationConfig).toMatchObject({
      responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 128, thinkingConfig: { thinkingLevel: 'minimal' },
    })
    expect(body.generationConfig.responseSchema.type).toBe('ARRAY')
    // Examples 1-7 as user/model pairs, then the real user turn.
    expect(body.contents).toHaveLength(EXAMPLES.length * 2 + 1)
    expect(body.contents.map((c: { role: string }) => c.role).slice(0, 4)).toEqual(['user', 'model', 'user', 'model'])
    expect(JSON.parse(body.contents[0].parts[0].text)).toEqual(EXAMPLES[0].input)
    const turn = JSON.parse(body.contents.at(-1).parts[0].text)
    expect(turn).toEqual({ transcript: 'I am thirsty, pass me the [STALL]', stalledAfter: 'pass me the', bank: orderBank(bank), place: 'Home kitchen', n: 3 })
  })

  it('never sends raw coordinates or unknown fields to the model', async () => {
    const { handle, fetchFn } = setup()
    await handle(post({ ...wire, place: { label: 'Home', lat: 1, lon: 2 }, secret: 'x', bank: [{ ...wire.bank[0], frames: ['leak'], id: 'leak' }] }))
    const turn = fetchFn.mock.calls[0][1]!.body as string
    expect(turn).not.toContain('"lat')
    expect(turn).not.toContain('secret')
    expect(turn).not.toContain('leak')
  })

  it('forwards a Gemini 429 as 429 with Retry-After and retryDelayMs, never retrying', async () => {
    const { handle, fetchFn } = setup({}, () => new Response(JSON.stringify({
      error: { code: 429, status: 'RESOURCE_EXHAUSTED', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '19s' }] },
    }), { status: 429 }))
    const res = await handle(post(wire))
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('19')
    expect(res.headers.get('access-control-expose-headers')).toContain('retry-after')
    expect(await res.json()).toEqual({ error: 'rate_limited', retryDelayMs: 19_000 })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a Gemini 500', () => new Response('{}', { status: 500 }), 502],
    ['a Gemini 400', () => new Response('{"error":{"message":"bad"}}', { status: 400 }), 502],
    ['empty model output', () => gemini200(''), 502],
    ['unreachable Gemini', () => { throw new TypeError('fetch failed') }, 502],
  ] as const)('maps %s to %i', async (_l, upstream, status) => {
    const { handle } = setup({}, upstream)
    expect((await handle(post(wire))).status).toBe(status)
  })

  it('maps a slow Gemini to 504', async () => {
    const { handle } = setup({ upstreamTimeoutMs: 20 }, (_u, init) => new Promise((_r, rej) => {
      init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    }))
    expect((await handle(post(wire))).status).toBe(504)
  })

  it('drops thought parts from the output', async () => {
    const { handle } = setup({}, () => Response.json({ candidates: [{ content: { parts: [{ text: 'thinking...', thought: true }, { text: MODEL_JSON }] } }] }))
    expect(await (await handle(post(wire))).text()).toBe(MODEL_JSON)
  })

  it('rejects bodies over 16 KB without calling Gemini', async () => {
    const { handle, fetchFn } = setup()
    const big = { ...wire, transcriptTail: 'x'.repeat(MAX_BODY_BYTES) }
    expect((await handle(post(big))).status).toBe(413)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('accepts a realistic full bank (150 entries) under 16 KB', async () => {
    const big: WordEntry[] = Array.from({ length: 150 }, (_, i) => ({ id: `w${i}`, word: `word${i}`, category: 'object', frames: [], tags: ['kitchen', 'home'] }))
    const { handle } = setup()
    expect((await handle(post(toWireRequest({ ...wire, place: undefined, bank: big })))).status).toBe(200)
  })

  it.each([
    ['empty transcriptTail', { ...wire, transcriptTail: '   ' }],
    ['missing bank', { ...wire, bank: undefined }],
    ['bad category', { ...wire, bank: [{ word: 'x', category: 'weapon', tags: [] }] }],
    ['non-string tag', { ...wire, bank: [{ word: 'x', category: 'object', tags: [1] }] }],
    ['not an object', '[1,2]'],
    ['invalid json', '{nope'],
  ])('rejects %s with 400', async (_l, body) => {
    const { handle, fetchFn } = setup()
    expect((await handle(post(body))).status).toBe(400)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('rejects other origins and methods, answers the preflight', async () => {
    const { handle, fetchFn, lines } = setup()
    expect((await handle(post(wire, { origin: 'https://evil.example' }))).status).toBe(403)
    expect(lines).toEqual(['predict: rejected origin "https://evil.example"'])
    const pre = await handle(new Request('https://nudge.example/api/predict', { method: 'OPTIONS', headers: { origin: ORIGIN } }))
    expect(pre.status).toBe(204)
    expect(pre.headers.get('access-control-allow-methods')).toContain('POST')
    expect((await handle(new Request('https://nudge.example/api/predict', { headers: { origin: ORIGIN } }))).status).toBe(405)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('rate-limits per IP with a correct Retry-After', async () => {
    let t = 0
    const { handle } = setup({ rateLimit: { max: 2, windowMs: 60_000 }, now: () => t })
    expect((await handle(post(wire))).status).toBe(200)
    t = 10_000
    expect((await handle(post(wire))).status).toBe(200)
    t = 20_000
    const res = await handle(post(wire))
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'rate_limited', retryDelayMs: 40_000 }) // first call frees at 60 s
    expect((await handle(post(wire, { 'x-forwarded-for': '9.9.9.9' }))).status).toBe(200)
  })

  it('returns 500 without calling Gemini when the key is missing', async () => {
    const { handle, fetchFn } = setup({ apiKey: undefined })
    expect((await handle(post(wire))).status).toBe(500)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('never puts the key in a response or a log line', async () => {
    const all: string[] = []
    for (const upstream of [() => gemini200(), () => new Response('{}', { status: 500 }), () => { throw new Error(KEY) }]) {
      const { handle, lines } = setup({}, upstream)
      const res = await handle(post(wire))
      all.push(await res.text(), JSON.stringify([...res.headers]), ...lines)
    }
    expect(all.join('\n')).not.toContain(KEY)
  })
})

describe('helpers', () => {
  it('parses retryDelay, with a default', () => {
    expect(retryDelayMs({ error: { details: [{ retryDelay: '2.5s' }] } })).toBe(2500)
    expect(retryDelayMs(null)).toBe(20_000)
  })

  it('caps the bank at 150 and keeps only known fields', () => {
    const r = parseWireRequest({ ...wire, bank: Array.from({ length: 200 }, () => ({ word: 'x', category: 'food', tags: [], extra: 1 })) })
    expect(r.ok && r.req.bank.length).toBe(150)
    expect(r.ok && Object.keys(r.req.bank[0])).toEqual(['word', 'category', 'tags'])
  })

  it('parses origins', () => {
    expect(parseOrigins('a, b,,null')).toEqual(['a', 'b', 'null'])
  })
})

// G1 (real G2): the Even app serves the packaged build from a local server, so the
// WebView's Origin is http://127.0.0.1:<port> (61976 in the logs). The port may change per launch.
describe('Even WebView origin (http://127.0.0.1:<any port>)', () => {
  it('serves the Even WebView origin on any port and still rejects other origins', async () => {
    const handle = createPredictHandler({
      apiKey: 'k', allowedOrigins: parseOrigins('http://localhost:5173,http://127.0.0.1:*'),
      fetch: (async () => Response.json({ candidates: [{ content: { parts: [{ text: '[]' }] } }] })) as unknown as typeof fetch,
    })
    const req = (origin: string) => new Request('https://nudge.example/api/predict', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(wire) })
    for (const port of [61976, 50123]) {
      const res = await handle(req(`http://127.0.0.1:${port}`))
      expect(res.status).toBe(200)
      expect(res.headers.get('access-control-allow-origin')).toBe(`http://127.0.0.1:${port}`)
    }
    expect((await handle(req('http://127.0.0.1.evil.com:80'))).status).toBe(403)
    expect((await handle(req('https://evil.example'))).status).toBe(403)
  })
})
