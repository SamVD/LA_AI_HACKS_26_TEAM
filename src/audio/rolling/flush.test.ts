// T-208: RollingStt.flush() in batch mode, over the real ElevenLabsStt (VAD, trimming,
// token, Scribe call) with a fake mic and a fake fetch. Synthetic PCM, no recordings.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Transcript } from '../../core/types'
import type { MicSource } from '../mic'
import { ElevenLabsStt } from '../stt'
import { chunks, quiet, synth, word } from '../test-signals'
import { TokenProvider } from '../token'
import { RollingStt } from './index'

const TOKEN_URL = 'https://nudge.example/api/stt/token'

class FakeMic implements MicSource {
  private cbs = new Set<(pcm: Uint8Array) => void>()
  async open() { return true }
  async close() {}
  onChunk(cb: (pcm: Uint8Array) => void) { this.cbs.add(cb); return () => { this.cbs.delete(cb) } }
  /** 50 ms chunks on the fake clock, like the glasses mic. */
  async play(bytes: Uint8Array) {
    for (const c of chunks(bytes)) {
      for (const cb of [...this.cbs]) cb(c)
      await vi.advanceTimersByTimeAsync(50)
    }
  }
}

function setup(o: { scribe?: () => Response | Promise<Response>; mode?: 'batch' | 'realtime' } = {}) {
  const texts = ['I take my um', 'and then some more']
  let n = 0
  const scribeCalls: number[] = []
  const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url) === TOKEN_URL) return Response.json({ token: `sutkn_${++n}` })
    scribeCalls.push(Date.now())
    const answer = o.scribe ? o.scribe() : Response.json({ text: texts[scribeCalls.length - 1] ?? 'more' })
    // Like real fetch, reject when the caller aborts (ElevenLabsStt's 4 s STT timeout).
    return Promise.race([answer, new Promise<Response>((_r, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    })])
  }) as unknown as typeof fetch
  const mic = new FakeMic()
  const base = new ElevenLabsStt({ mic, tokens: new TokenProvider({ url: TOKEN_URL, fetch: fetchFn }), fetch: fetchFn })
  const stt = new RollingStt({ base, mic, realtimeTokens: new TokenProvider({ url: TOKEN_URL, fetch: fetchFn }), mode: o.mode ?? 'batch' })
  const finals: Transcript[] = []
  stt.onTranscript(t => { if (t.isFinal) finals.push(t) })
  return { stt, mic, finals, scribeCalls }
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('RollingStt.flush (T-208)', () => {
  it('ends the segment being spoken and resolves after its final is emitted, without waiting for the pause', async () => {
    const { stt, mic, finals } = setup()
    await stt.start()
    await mic.play(synth([quiet(300), word(700), quiet(200)])) // only 200 ms of pause: the 800 ms segment end is far off
    expect(finals).toEqual([])
    let resolved = false
    const p = stt.flush().then(() => { resolved = true })
    await vi.advanceTimersByTimeAsync(0)
    await p
    expect(resolved).toBe(true)
    expect(finals.map(f => f.text)).toEqual(['I take my um'])
    await stt.stop()
  })

  it('resolves at once when nothing with speech is buffered', async () => {
    const { stt, mic, scribeCalls } = setup()
    await stt.start()
    await mic.play(synth([quiet(600)]))
    let resolved = false
    void stt.flush().then(() => { resolved = true })
    await vi.advanceTimersByTimeAsync(0)
    expect(resolved).toBe(true)
    expect(scribeCalls).toEqual([])
    await stt.stop()
  })

  it('keeps the batch loop running: the next segment is recorded and transcribed as usual', async () => {
    const { stt, mic, finals } = setup()
    await stt.start()
    await mic.play(synth([quiet(300), word(600), quiet(100)]))
    await stt.flush()
    await mic.play(synth([quiet(300), word(600), quiet(1200)])) // ends on its own pause
    await vi.advanceTimersByTimeAsync(0)
    expect(finals.map(f => f.text)).toEqual(['I take my um', 'and then some more'])
    await stt.stop()
  })

  it('never rejects when the transcription fails, and stop() then returns at once (no waiting out the backoff)', async () => {
    const { stt, mic, finals } = setup({ scribe: () => new Response('{}', { status: 500 }) })
    await stt.start()
    await mic.play(synth([quiet(300), word(600), quiet(100)]))
    await expect(stt.flush()).resolves.toBeUndefined()
    expect(finals).toEqual([])
    // The loop is now in its error backoff (fake timers never advance it). stop() must not wait on it.
    await expect(stt.stop()).resolves.toBeUndefined()
  })

  it('resolves at once in realtime mode and when stopped', async () => {
    const rt = setup({ mode: 'realtime' })
    await expect(rt.stt.flush()).resolves.toBeUndefined()
    const batch = setup()
    await expect(batch.stt.flush()).resolves.toBeUndefined() // never started
  })

  it('a slow transcription: flush resolves when the STT timeout (4 s) handles the segment', async () => {
    const { stt, mic } = setup({ scribe: () => new Promise<Response>(() => {}) })
    await stt.start()
    await mic.play(synth([quiet(300), word(600), quiet(100)]))
    let resolved = false
    void stt.flush().then(() => { resolved = true })
    await vi.advanceTimersByTimeAsync(0)
    expect(resolved).toBe(false) // waiting on the transcription
    await vi.advanceTimersByTimeAsync(4100)
    expect(resolved).toBe(true) // Step 2 caps its own wait at 1.2 s; this bounds the rest
    await stt.stop()
  })
})
