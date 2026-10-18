import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Transcript, WordEntry } from '../../core/types'
import type { MicSource } from '../mic'
import type { ElevenLabsStt } from '../stt'
import { TokenProvider } from '../token'
import { TranscriptBuffer } from './buffer'
import { RollingStt, personalKeyterms, realtimeTokenUrl } from './index'
import { RealtimeTranscriber, cleanKeyterms, realtimeUrl, toBase64, type SocketLike } from './realtime'

// --- fakes -------------------------------------------------------------------

function fakeMic() {
  const listeners = new Set<(pcm: Uint8Array) => void>()
  const mic: MicSource = {
    open: async () => true,
    close: async () => {},
    onChunk(cb) { listeners.add(cb); return () => { listeners.delete(cb) } },
  }
  return { mic, listeners, chunk: (ms = 50) => { for (const l of [...listeners]) l(new Uint8Array(ms * 32)) } }
}

class FakeSocket implements SocketLike {
  readyState = 1
  sent: Array<Record<string, unknown>> = []
  closed = false
  onopen: SocketLike['onopen'] = null
  onmessage: SocketLike['onmessage'] = null
  onerror: SocketLike['onerror'] = null
  onclose: SocketLike['onclose'] = null
  constructor(readonly url: string) {}
  send(data: string) { this.sent.push(JSON.parse(data)) }
  close() { this.closed = true; this.readyState = 3 }
  server(msg: Record<string, unknown>) { this.onmessage?.({ data: JSON.stringify(msg) }) }
  drop(code = 1006) { this.readyState = 3; this.onclose?.({ code, reason: 'network' }) }
}

function fakeTokens() {
  let n = 0
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ token: `sutkn_${++n}` }) }) as unknown as Response)
  return { tokens: new TokenProvider({ url: 'https://api.example/api/stt/token', type: 'realtime_scribe', fetch, now: Date.now }), fetch }
}

function setup(keyterms: string[] = []) {
  const { mic, listeners, chunk } = fakeMic()
  const { tokens, fetch } = fakeTokens()
  const sockets: FakeSocket[] = []
  const emitted: Transcript[] = []
  const log = vi.fn()
  const rt = new RealtimeTranscriber({
    mic, tokens, emit: t => emitted.push(t), keyterms: () => keyterms, now: Date.now, log,
    socket: url => { const s = new FakeSocket(url); sockets.push(s); return s },
  })
  const socket = () => sockets[sockets.length - 1]
  return { rt, mic, listeners, chunk, sockets, socket, emitted, log, fetch }
}


beforeEach(() => { vi.useFakeTimers({ now: 5_000_000 }) })
afterEach(() => { vi.useRealTimers() })

// --- buffer ------------------------------------------------------------------

describe('TranscriptBuffer', () => {
  const t = (text: string, end: number, isFinal = true): Transcript => ({ text, isFinal, tStartMs: end - 1000, tEndMs: end })

  it('keeps finals, tracks the latest partial, and ignores empty or failed segments', () => {
    const b = new TranscriptBuffer()
    b.push(t('we went to the', 1000))
    b.push(t('park with', 1500, false))
    b.push(t('', 1600))
    b.push({ ...t('x', 1700), error: 'network' })
    expect(b.segments().map(s => s.text)).toEqual(['we went to the'])
    expect(b.current()?.text).toBe('park with')
    expect(b.lastWords(3)).toBe('went to the')
    expect(b.lastWords(3, true)).toBe('the park with')
    b.push(t('park with Maya', 2000))
    expect(b.current()).toBeNull()
  })

  it('answers the last N seconds and drops old or excess segments', () => {
    const b = new TranscriptBuffer({ maxAgeMs: 60_000, maxSegments: 3 })
    for (let i = 1; i <= 5; i++) b.push(t(`s${i}`, i * 10_000))
    expect(b.segments().map(s => s.text)).toEqual(['s3', 's4', 's5'])
    expect(b.lastSeconds(15_000, 50_000).map(s => s.text)).toEqual(['s4', 's5'])
    b.push(t('late', 200_000))
    expect(b.segments().map(s => s.text)).toEqual(['late'])
    b.clear()
    expect(b.segments()).toHaveLength(0)
  })
})

// --- realtime protocol ---------------------------------------------------------

describe('RealtimeTranscriber', () => {
  it('opens one socket with the S-1 parameters and cleaned personal keyterms', async () => {
    const { rt, socket } = setup(['Maya', ' Lisinopril ', 'maya', 'a'.repeat(21), ''])
    await rt.start()
    const url = new URL(socket().url)
    expect(url.origin + url.pathname).toBe('wss://api.elevenlabs.io/v1/speech-to-text/realtime')
    expect(Object.fromEntries([...url.searchParams].filter(([k]) => k !== 'keyterms'))).toEqual({
      model_id: 'scribe_v2_realtime', token: 'sutkn_1', audio_format: 'pcm_16000', commit_strategy: 'vad',
      vad_silence_threshold_secs: '0.8', language_code: 'en', include_timestamps: 'true',
    })
    expect(url.searchParams.getAll('keyterms')).toEqual(['Maya', 'Lisinopril'])
    await rt.stop()
  })

  it('queues audio until session_started, then streams base64 chunks', async () => {
    const { rt, socket, chunk } = setup()
    await rt.start()
    chunk(); chunk()
    expect(socket().sent).toHaveLength(0)
    socket().server({ message_type: 'session_started' })
    expect(socket().sent).toHaveLength(2)
    chunk()
    expect(socket().sent).toHaveLength(3)
    expect(socket().sent[0]).toEqual({ message_type: 'input_audio_chunk', audio_base_64: toBase64(new Uint8Array(1600)), commit: false, sample_rate: 16000 })
    await rt.stop()
  })

  it('maps partials and commits, drops empty commits, and dedupes the two commit kinds', async () => {
    const { rt, socket, chunk, emitted } = setup()
    await rt.start()
    socket().server({ message_type: 'session_started' })
    chunk()
    socket().server({ message_type: 'partial_transcript', text: 'we went to' })
    socket().server({ message_type: 'partial_transcript', text: '  ' })
    socket().server({ message_type: 'committed_transcript', text: 'We went to the park.' })
    socket().server({ message_type: 'committed_transcript_with_timestamps', text: 'We went to the park.', words: [{ text: 'We', start: 0, end: 0.2, type: 'word' }] })
    socket().server({ message_type: 'committed_transcript', text: '' })
    expect(emitted.map(t => [t.text, t.isFinal])).toEqual([['we went to', false], ['We went to the park.', true]])
    expect(rt.stats).toMatchObject({ partials: 1, finals: 1, emptyCommits: 1, duplicates: 1 })
    await rt.stop()
  })

  it('uses word timestamps for final times when present', async () => {
    const { rt, socket, chunk, emitted } = setup()
    await rt.start()
    socket().server({ message_type: 'session_started' })
    chunk() // first audio: session t0 = now - 50 ms
    await vi.advanceTimersByTimeAsync(3000)
    socket().server({ message_type: 'committed_transcript_with_timestamps', text: 'cup please', words: [
      { text: 'cup', start: 1.0, end: 1.4, type: 'word' }, { text: ' ', start: 1.4, end: 1.5, type: 'spacing' }, { text: 'please', start: 1.5, end: 2.0, type: 'word' },
    ] })
    const t0 = 5_000_000 - 50
    expect(emitted[0]).toMatchObject({ isFinal: true, tStartMs: t0 + 1000, tEndMs: t0 + 2000 })
    await rt.stop()
  })

  it('reconnects with a fresh token after a drop and sends previous_text on the first chunk only', async () => {
    const { rt, sockets, socket, chunk, fetch } = setup()
    await rt.start()
    socket().server({ message_type: 'session_started' })
    chunk()
    socket().server({ message_type: 'committed_transcript', text: 'I take my lisinopril' })
    socket().drop()
    chunk() // held while reconnecting
    await vi.advanceTimersByTimeAsync(600)
    expect(sockets).toHaveLength(2)
    expect(new URL(socket().url).searchParams.get('token')).not.toBe(new URL(sockets[0].url).searchParams.get('token'))
    socket().server({ message_type: 'session_started' })
    chunk()
    expect(socket().sent[0].previous_text).toBe('I take my lisinopril')
    expect(socket().sent[1].previous_text).toBeUndefined()
    expect(socket().sent).toHaveLength(2)
    expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(2)
    await rt.stop()
  })

  it('reconnects on a server error message', async () => {
    const { rt, sockets, socket, log } = setup()
    await rt.start()
    socket().server({ message_type: 'session_started' })
    socket().server({ message_type: 'session_time_limit_exceeded', error: 'limit' })
    expect(log).toHaveBeenCalledWith('rolling.server-error', { type: 'session_time_limit_exceeded', error: 'limit' })
    expect(sockets[0].closed).toBe(true)
    await vi.advanceTimersByTimeAsync(600)
    expect(sockets).toHaveLength(2)
    await rt.stop()
  })

  it('backs off (0.5, 1, 2, 4 s ...) while tokens fail, then connects', async () => {
    const { rt, sockets, fetch, log } = setup()
    fetch.mockResolvedValue({ ok: false, status: 503 } as Response)
    await rt.start()
    expect(sockets).toHaveLength(0)
    expect(log).toHaveBeenCalledWith('rolling.token-failed', expect.objectContaining({ detail: 'token http 503' }))
    const at = (n: number) => fetch.mock.calls.length >= n
    await vi.advanceTimersByTimeAsync(500); const afterFirstRetry = fetch.mock.calls.length
    await vi.advanceTimersByTimeAsync(900); expect(fetch.mock.calls.length).toBe(afterFirstRetry) // next retry waits 1 s
    await vi.advanceTimersByTimeAsync(100); expect(at(afterFirstRetry + 1)).toBe(true)
    fetch.mockImplementation(async () => ({ ok: true, json: async () => ({ token: 'sutkn_ok' }) }) as unknown as Response)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(sockets).toHaveLength(1)
    expect(new URL(sockets[0].url).searchParams.get('token')).toBe('sutkn_ok')
    await rt.stop()
  })

  it('stop() closes the socket, unsubscribes from the mic and never reconnects', async () => {
    const { rt, sockets, socket, listeners } = setup()
    await rt.start()
    expect(listeners.size).toBe(1)
    await rt.stop()
    expect(socket().closed).toBe(true)
    expect(listeners.size).toBe(0)
    socket().drop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(sockets).toHaveLength(1)
  })

  it('runs 5 minutes continuously with a mid-run drop, without leaks', async () => {
    const { rt, sockets, socket, chunk, emitted, listeners } = setup(['Maya'])
    const buffer = new TranscriptBuffer({ maxSegments: 50 })
    await rt.start()
    socket().server({ message_type: 'session_started' })
    let sentences = 0
    for (let ms = 0; ms < 5 * 60_000; ms += 50) {
      chunk(50)
      if (ms % 20_000 === 10_000) socket().server({ message_type: 'partial_transcript', text: `sentence ${sentences}` })
      if (ms % 20_000 === 15_000) { socket().server({ message_type: 'committed_transcript', text: `sentence ${sentences} done.` }); sentences++ }
      if (ms % 35_000 === 34_950) socket().server({ message_type: 'committed_transcript', text: '' })
      if (ms === 150_000) socket().drop()
      if (ms === 150_600) socket().server({ message_type: 'session_started' })
      await vi.advanceTimersByTimeAsync(50)
    }
    for (const t of emitted) buffer.push(t)
    const finals = emitted.filter(t => t.isFinal)
    expect(finals.map(t => t.text)).toEqual(Array.from({ length: sentences }, (_, i) => `sentence ${i} done.`))
    expect(finals.every(t => t.text.trim())).toBe(true)
    expect(sockets).toHaveLength(2)
    expect(listeners.size).toBe(1)
    expect(rt.stats.emptyCommits).toBeGreaterThanOrEqual(8)
    // Every chunk was sent (the 600 ms reconnect gap was queued, not lost).
    const sent = sockets.reduce((n, s) => n + s.sent.length, 0)
    expect(sent).toBe(5 * 60_000 / 50)
    expect(buffer.segments().length).toBeLessThanOrEqual(50)
    await rt.stop()
    expect(listeners.size).toBe(0)
  }, 30_000)
})

// --- wrapper and helpers ---------------------------------------------------------

describe('RollingStt', () => {
  function fakeBase(texts: string[]) {
    const emitted: Transcript[] = []
    const base = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      emitTranscript: (t: Transcript) => emitted.push(t),
      onTranscript: vi.fn(),
      onSpeechState: vi.fn(),
      transcribeUtterance: vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000))
        const text = texts.shift()
        return text === undefined
          ? { text: '', isFinal: true, tStartMs: 0, tEndMs: 0, error: 'no-speech' as const }
          : { text, isFinal: true, tStartMs: 0, tEndMs: 0 }
      }),
    }
    return { base: base as unknown as ElevenLabsStt, raw: base, emitted }
  }

  it('batch fallback emits back-to-back utterances as finals and stops cleanly', async () => {
    const { base, raw, emitted } = fakeBase(['hello there', ' ', 'the park'])
    const { mic } = fakeMic()
    const stt = new RollingStt({ base, mic, realtimeTokens: fakeTokens().tokens, mode: 'batch' })
    await stt.start()
    expect(raw.start).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(3500)
    expect(emitted.map(t => t.text)).toEqual(['hello there', 'the park'])
    const stopping = stt.stop()
    await vi.advanceTimersByTimeAsync(1000)
    await stopping
    expect(raw.stop).toHaveBeenCalled()
  })

  it('delegates Step 1 utterances to the base service', async () => {
    const { base, raw } = fakeBase(['cup'])
    const stt = new RollingStt({ base, mic: fakeMic().mic, realtimeTokens: fakeTokens().tokens, mode: 'batch' })
    const r = stt.transcribeUtterance({ maxMs: 8000, endSilenceMs: 1200 })
    await vi.advanceTimersByTimeAsync(1000)
    expect((await r).text).toBe('cup')
    expect(raw.transcribeUtterance).toHaveBeenCalledWith({ maxMs: 8000, endSilenceMs: 1200 })
  })
})

describe('helpers', () => {
  it('personal keyterms are names, medications and places only', () => {
    const w = (word: string, category: WordEntry['category']): WordEntry => ({ id: word, word, category, frames: [], tags: [] })
    expect(personalKeyterms([w('Maya', 'person'), w('cup', 'object'), w('Lisinopril', 'medication'), w('park', 'place')])).toEqual(['Maya', 'Lisinopril', 'park'])
  })

  it('caps keyterms at 50', () => {
    expect(cleanKeyterms(Array.from({ length: 80 }, (_, i) => `t${i}`))).toHaveLength(50)
  })

  it('derives the realtime token URL for the dev server and keeps the hosted one', () => {
    expect(realtimeTokenUrl('http://localhost:8787/token/batch_scribe')).toBe('http://localhost:8787/token/realtime_scribe')
    expect(realtimeTokenUrl('https://x.vercel.app/api/stt/token')).toBe('https://x.vercel.app/api/stt/token')
  })

  it('base64-encodes large buffers', () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 256)
    expect(atob(toBase64(bytes)).length).toBe(100_000)
    expect(realtimeUrl('t', ['a b'])).toContain('keyterms=a+b')
  })
})
