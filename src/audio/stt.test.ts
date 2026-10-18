import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpeechState } from '../core/types'
import type { MicSource } from './mic'
import { BYTES_PER_MS } from './pcm'
import { ElevenLabsStt } from './stt'
import { chunks, quiet, synth, word } from './test-signals'
import { TokenProvider } from './token'

const TOKEN_URL = 'https://nudge.example/api/stt/token'

class FakeMic implements MicSource {
  opens = 0
  closes = 0
  isOpen = false
  allow = true
  private cbs = new Set<(pcm: Uint8Array) => void>()
  async open() { this.opens++; this.isOpen = this.allow; return this.allow }
  async close() { this.closes++; this.isOpen = false }
  onChunk(cb: (pcm: Uint8Array) => void) { this.cbs.add(cb); return () => { this.cbs.delete(cb) } }
  /** Deliver audio in 50 ms chunks on the fake clock, like the glasses mic. */
  async play(bytes: Uint8Array) {
    for (const c of chunks(bytes)) {
      for (const cb of [...this.cbs]) cb(c)
      await vi.advanceTimersByTimeAsync(50)
    }
  }
}

interface Call { url: string; init?: RequestInit }

function fakeFetch(scribe: (call: Call) => Response | Promise<Response> = () => Response.json({ text: 'cup' })) {
  const calls: Call[] = []
  let n = 0
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const call = { url, init }
    calls.push(call)
    if (url === TOKEN_URL) return Response.json({ token: `sutkn_${++n}` })
    return scribe(call)
  })
  return { fn: fn as unknown as typeof fetch, calls, scribeCalls: () => calls.filter(c => c.url !== TOKEN_URL), tokenCalls: () => calls.filter(c => c.url === TOKEN_URL) }
}

function setup(scribe?: Parameters<typeof fakeFetch>[0], mic = new FakeMic()) {
  const f = fakeFetch(scribe)
  const log: Array<[string, unknown]> = []
  const stt = new ElevenLabsStt({
    mic,
    tokens: new TokenProvider({ url: TOKEN_URL, fetch: f.fn }),
    fetch: f.fn,
    log: (e, d) => log.push([e, d]),
  })
  return { stt, mic, f, log }
}

const OPTS = { maxMs: 8000, endSilenceMs: 1200 }

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('ElevenLabsStt.transcribeUtterance', () => {
  it('records until end of speech, sends trimmed raw PCM with the spec fields, returns the text', async () => {
    const { stt, mic, f } = setup()
    const p = stt.transcribeUtterance({ ...OPTS, targetHint: 'cup' })
    await mic.play(synth([quiet(600), word(500), quiet(1600)]))
    const t = await p

    expect(t).toMatchObject({ text: 'cup', isFinal: true })
    expect(t.error).toBeUndefined()
    expect(t.tEndMs - t.tStartMs).toBeGreaterThanOrEqual(450)

    const [call] = f.scribeCalls()
    expect(call.url).toMatch(/^https:\/\/api\.elevenlabs\.io\/v1\/speech-to-text\?token=sutkn_\d$/)
    const fd = call.init!.body as FormData
    expect(fd.get('model_id')).toBe('scribe_v2')
    expect(fd.get('language_code')).toBe('en')
    expect(fd.get('file_format')).toBe('pcm_s16le_16')
    expect(fd.has('keyterms')).toBe(false) // D1: targetHint is never sent
    const audioMs = (fd.get('file') as Blob).size / BYTES_PER_MS
    // ~300 ms pre-roll + ~500 ms word + ~250 ms tail, not the full 2.7 s
    expect(audioMs).toBeGreaterThan(900)
    expect(audioMs).toBeLessThan(1250)
  })

  it('ends on silence, not on maxMs', async () => {
    const { stt, mic } = setup()
    const p = stt.transcribeUtterance(OPTS)
    let done = false
    void p.then(() => { done = true })
    await mic.play(synth([quiet(300), word(400), quiet(1000)]))
    expect(done).toBe(false) // 1000 ms of silence < endSilenceMs
    await mic.play(synth([quiet(400)]))
    await vi.advanceTimersByTimeAsync(0)
    expect(done).toBe(true)
  })

  it('returns no-speech without calling STT when nobody speaks before maxMs', async () => {
    const { stt, mic, f } = setup()
    const p = stt.transcribeUtterance({ maxMs: 3000, endSilenceMs: 1200 })
    await mic.play(synth([quiet(3100)]))
    expect((await p).error).toBe('no-speech')
    expect(f.scribeCalls()).toHaveLength(0)
  })

  it('sends what it has when maxMs cuts off ongoing speech', async () => {
    const { stt, mic, f } = setup()
    const p = stt.transcribeUtterance({ maxMs: 2000, endSilenceMs: 1200 })
    await mic.play(synth([quiet(300), word(2000)]))
    expect((await p).text).toBe('cup')
    expect(f.scribeCalls()).toHaveLength(1)
  })

  it('reports mic-denied when the host refuses the mic', async () => {
    const mic = new FakeMic()
    mic.allow = false
    const { stt, log } = setup(undefined, mic)
    const t = await stt.transcribeUtterance(OPTS)
    expect(t).toMatchObject({ text: '', error: 'mic-denied' })
    expect(log.some(([e]) => e === 'stt.mic-denied')).toBe(true)
  })

  it('reports unknown (logged) when the mic opens but no audio ever arrives', async () => {
    const { stt, log } = setup()
    const p = stt.transcribeUtterance(OPTS)
    await vi.advanceTimersByTimeAsync(3100)
    expect((await p).error).toBe('unknown')
    expect(log.some(([e]) => e === 'stt.no-audio')).toBe(true)
  })

  it.each([
    ['http 403 (bad or reused token)', () => new Response('{}', { status: 403 }), 'unknown'],
    ['http 429', () => new Response('{}', { status: 429 }), 'unknown'],
    ['empty transcript', () => Response.json({ text: '  ' }), 'no-speech'],
    ['network failure', () => { throw new TypeError('Failed to fetch') }, 'network'],
  ] as const)('maps %s to %s', async (_label, scribe, error) => {
    const { stt, mic } = setup(scribe)
    const p = stt.transcribeUtterance(OPTS)
    await mic.play(synth([quiet(300), word(400), quiet(1300)]))
    expect(await p).toMatchObject({ text: '', error })
  })

  it('maps a slow STT response to timeout', async () => {
    const { stt, mic } = setup(call => new Promise((_res, rej) => {
      call.init!.signal!.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    }))
    const p = stt.transcribeUtterance(OPTS)
    await mic.play(synth([quiet(300), word(400), quiet(1300)]))
    await vi.advanceTimersByTimeAsync(4100)
    expect((await p).error).toBe('timeout')
  })

  it('pre-mints the token: one ready at construction, the next minted right after use', async () => {
    const { stt, mic, f } = setup()
    await vi.advanceTimersByTimeAsync(0)
    expect(f.tokenCalls()).toHaveLength(1) // ready before the first prompt

    const p1 = stt.transcribeUtterance(OPTS)
    await mic.play(synth([quiet(300), word(400), quiet(1300)]))
    await p1
    expect(f.tokenCalls()).toHaveLength(2) // next one already minting
    const p2 = stt.transcribeUtterance(OPTS)
    await mic.play(synth([quiet(300), word(400), quiet(1300)]))
    await p2
    const tokens = f.scribeCalls().map(c => new URL(c.url).searchParams.get('token'))
    expect(new Set(tokens).size).toBe(2) // single-use: never reused
  })

  it('keeps the mic warm between prompts, then closes it', async () => {
    const { stt, mic } = setup()
    for (let i = 0; i < 2; i++) {
      const p = stt.transcribeUtterance(OPTS)
      await mic.play(synth([quiet(300), word(400), quiet(1300)]))
      await p
    }
    expect(mic.opens).toBe(1)
    expect(mic.isOpen).toBe(true)
    await vi.advanceTimersByTimeAsync(10_100)
    expect(mic.isOpen).toBe(false)
  })

  it('stop() cancels a pending utterance (resolves, never rejects) and closes the mic', async () => {
    const { stt, mic } = setup()
    const p = stt.transcribeUtterance(OPTS)
    await mic.play(synth([quiet(300), word(200)]))
    await stt.stop()
    expect((await p).error).toBe('no-speech')
    expect(mic.isOpen).toBe(false)
  })

  it('emits speech state transitions while recording', async () => {
    const { stt, mic } = setup()
    const states: SpeechState[] = []
    stt.onSpeechState(s => states.push(s))
    const p = stt.transcribeUtterance(OPTS)
    await mic.play(synth([quiet(300), word(500), quiet(1300)]))
    await p
    expect(states.map(s => s.speaking)).toEqual([true, false])
  })
})

describe('ElevenLabsStt.start/stop', () => {
  it('opens the mic and reports speech state from local VAD', async () => {
    const { stt, mic } = setup()
    const states: boolean[] = []
    stt.onSpeechState(s => states.push(s.speaking))
    await stt.start()
    await mic.play(synth([quiet(300), word(500), quiet(800)]))
    expect(states).toEqual([true, false])
    await stt.stop()
    expect(mic.isOpen).toBe(false)
  })

  it('does not double-report speech state when an utterance runs during start()', async () => {
    const { stt, mic } = setup()
    const states: boolean[] = []
    stt.onSpeechState(s => states.push(s.speaking))
    await stt.start()
    const p = stt.transcribeUtterance(OPTS)
    await mic.play(synth([quiet(300), word(500), quiet(1300)]))
    await p
    expect(states).toEqual([true, false])
    expect(mic.opens).toBe(1)
  })
})
