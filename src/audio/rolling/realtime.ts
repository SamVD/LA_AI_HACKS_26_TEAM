// Rolling transcript over ElevenLabs Scribe realtime (T-202, per S-1 / D2 / D5):
// one WebSocket per mode session, glasses-mic PCM streamed as base64 chunks,
// partials → isFinal:false, VAD commits → isFinal:true. Empty commits (one
// every ~35 s of silence) are dropped. On close or an error message we mint a
// fresh single-use token, reconnect, and send `previous_text` on the first chunk.
//
// Audio is never stored: chunks are only held while the socket is (re)connecting,
// capped at a few seconds.
import type { Transcript } from '../../core/types'
import type { MicSource } from '../mic'
import { BYTES_PER_MS } from '../pcm'
import type { TokenProvider } from '../token'

/** The slice of the browser WebSocket we use; tests pass a fake. */
export interface SocketLike {
  readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: ((ev: unknown) => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
  onerror: ((ev: unknown) => void) | null
  onclose: ((ev: { code?: number; reason?: string }) => void) | null
}
export type SocketFactory = (url: string) => SocketLike

export interface RealtimeOptions {
  mic: MicSource
  /** A `realtime_scribe` token provider. */
  tokens: TokenProvider
  emit(t: Transcript): void
  /** Personal-bank names, medications and places (D2). Never the on-screen candidates. */
  keyterms?: () => string[] | Promise<string[]>
  now?: () => number
  log?: (event: string, data?: unknown) => void
  socket?: SocketFactory
  host?: string
  vadSilenceSecs?: number
  /** Reconnect backoff: first delay, doubled per failure, capped. */
  retryMs?: number
  maxRetryMs?: number
  /** Audio held while (re)connecting, so speech at a reconnect isn't lost. */
  maxQueueMs?: number
}

const OPEN = 1
const MAX_PREVIOUS_CHARS = 200
const DUPLICATE_WINDOW_MS = 2000

export const MAX_KEYTERMS = 50
export const MAX_KEYTERM_CHARS = 20

/** D2: keyterms are clipped to the API limits; longer or empty terms are dropped. */
export function cleanKeyterms(terms: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of terms) {
    const t = raw.trim()
    if (!t || t.length > MAX_KEYTERM_CHARS || seen.has(t.toLowerCase())) continue
    seen.add(t.toLowerCase())
    out.push(t)
    if (out.length === MAX_KEYTERMS) break
  }
  return out
}

export function realtimeUrl(token: string, keyterms: string[], host = 'api.elevenlabs.io', vadSilenceSecs = 0.8): string {
  const qs = new URLSearchParams({
    model_id: 'scribe_v2_realtime',
    token,
    audio_format: 'pcm_16000',
    commit_strategy: 'vad',
    vad_silence_threshold_secs: String(vadSilenceSecs),
    language_code: 'en',
    include_timestamps: 'true',
  })
  for (const k of keyterms) qs.append('keyterms', k)
  return `wss://${host}/v1/speech-to-text/realtime?${qs}`
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

interface ScribeMessage {
  message_type?: string
  text?: string
  error?: string
  words?: Array<{ text?: string; start?: number; end?: number; type?: string }>
}

export class RealtimeTranscriber {
  private readonly now: () => number
  private readonly log: (event: string, data?: unknown) => void
  private readonly socketFactory: SocketFactory
  private running = false
  private ws: SocketLike | null = null
  private ready = false
  private connecting = false
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private failures = 0
  private queue: Uint8Array[] = []
  private queuedBytes = 0
  private offChunk: (() => void) | null = null
  private previousText = ''
  private sendPrevious = false
  /** ctx-clock time of the first audio sent on this socket: word timestamps are relative to it. */
  private sessionT0 = 0
  private segmentStart: number | null = null
  private lastFinal: { text: string; at: number } | null = null
  /** Bumped on every (re)connect, so events from an old socket are ignored. */
  private socketGen = 0
  readonly stats = { connects: 0, reconnects: 0, partials: 0, finals: 0, emptyCommits: 0, duplicates: 0, errors: 0 }

  constructor(private readonly o: RealtimeOptions) {
    this.now = o.now ?? Date.now
    this.log = o.log ?? (() => {})
    this.socketFactory = o.socket ?? (url => new WebSocket(url) as unknown as SocketLike)
  }

  get connected(): boolean { return this.ready }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    this.failures = 0
    this.offChunk = this.o.mic.onChunk(pcm => this.onChunk(pcm))
    this.o.tokens.prime()
    await this.connect()
  }

  async stop(): Promise<void> {
    this.running = false
    this.offChunk?.()
    this.offChunk = null
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    this.socketGen++
    this.closeSocket()
    this.queue = []
    this.queuedBytes = 0
    this.segmentStart = null
  }

  private closeSocket() {
    const ws = this.ws
    this.ws = null
    this.ready = false
    if (!ws) return
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null
    try { ws.close(1000, 'stop') } catch { /* already closed */ }
  }

  private async connect(): Promise<void> {
    if (!this.running || this.connecting) return
    this.connecting = true
    try {
      const tok = await this.o.tokens.take()
      if (!this.running) return
      if (!tok.ok) {
        this.log('rolling.token-failed', { error: tok.error, detail: tok.detail })
        this.scheduleReconnect()
        return
      }
      let terms: string[] = []
      try { terms = cleanKeyterms(await (this.o.keyterms?.() ?? [])) } catch (err) { this.log('rolling.keyterms-failed', { error: String(err) }) }
      const gen = ++this.socketGen
      const ws = this.socketFactory(realtimeUrl(tok.token, terms, this.o.host, this.o.vadSilenceSecs))
      this.ws = ws
      this.stats.connects++
      ws.onmessage = ev => { if (gen === this.socketGen) this.onMessage(ev.data) }
      ws.onerror = () => { if (gen === this.socketGen) this.log('rolling.socket-error') }
      ws.onclose = ev => {
        if (gen !== this.socketGen) return
        this.log('rolling.closed', { code: ev.code, reason: ev.reason })
        this.ws = null
        this.ready = false
        this.scheduleReconnect()
      }
    } finally {
      this.connecting = false
    }
  }

  private scheduleReconnect() {
    if (!this.running || this.retryTimer) return
    this.closeSocket()
    this.failures++
    this.stats.reconnects++
    const base = this.o.retryMs ?? 500
    const delay = Math.min(this.o.maxRetryMs ?? 15_000, base * 2 ** (this.failures - 1))
    this.sendPrevious = Boolean(this.previousText)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.connect()
    }, delay)
  }

  private onMessage(data: unknown) {
    let msg: ScribeMessage
    try { msg = JSON.parse(String(data)) as ScribeMessage } catch { return }
    const type = msg.message_type ?? ''
    if (type === 'session_started') {
      this.ready = true
      this.failures = 0
      this.sessionT0 = 0
      this.log('rolling.session-started', { keyterms: true })
      this.flushQueue()
      return
    }
    if (type === 'partial_transcript') {
      const text = msg.text?.trim() ?? ''
      if (!text) return
      this.segmentStart ??= this.now()
      this.stats.partials++
      this.o.emit({ text, isFinal: false, tStartMs: this.segmentStart, tEndMs: this.now() })
      return
    }
    if (type === 'committed_transcript' || type === 'committed_transcript_with_timestamps') {
      const text = msg.text?.trim() ?? ''
      const start = this.segmentStart
      this.segmentStart = null
      if (!text) { this.stats.emptyCommits++; return }
      const t = this.now()
      // With include_timestamps the server may send both commit kinds for one segment.
      if (this.lastFinal && this.lastFinal.text === text && t - this.lastFinal.at < DUPLICATE_WINDOW_MS) { this.stats.duplicates++; return }
      this.lastFinal = { text, at: t }
      const words = msg.words?.filter(w => w.type !== 'spacing' && typeof w.start === 'number' && typeof w.end === 'number')
      const tStartMs = words?.length && this.sessionT0 ? this.sessionT0 + words[0].start! * 1000 : start ?? t
      const tEndMs = words?.length && this.sessionT0 ? this.sessionT0 + words[words.length - 1].end! * 1000 : t
      this.previousText = `${this.previousText} ${text}`.trim().slice(-MAX_PREVIOUS_CHARS)
      this.stats.finals++
      this.o.emit({ text, isFinal: true, tStartMs, tEndMs })
      return
    }
    if (msg.error || /error|exceeded|limited|throttled|overflow|exhausted|invalid/.test(type)) {
      this.stats.errors++
      this.log('rolling.server-error', { type, error: msg.error })
      this.scheduleReconnect()
    }
  }

  private onChunk(pcm: Uint8Array) {
    if (!this.running || !pcm.byteLength) return
    if (this.ready && this.ws?.readyState === OPEN) {
      this.flushQueue()
      this.send(pcm)
      return
    }
    // Hold recent audio while (re)connecting; drop the oldest beyond the cap.
    this.queue.push(pcm.slice())
    this.queuedBytes += pcm.byteLength
    const cap = (this.o.maxQueueMs ?? 3000) * BYTES_PER_MS
    while (this.queuedBytes > cap && this.queue.length > 1) this.queuedBytes -= this.queue.shift()!.byteLength
  }

  private flushQueue() {
    if (!this.ready || this.ws?.readyState !== OPEN) return
    const pending = this.queue
    this.queue = []
    this.queuedBytes = 0
    for (const pcm of pending) this.send(pcm)
  }

  private send(pcm: Uint8Array) {
    if (!this.sessionT0) this.sessionT0 = this.now() - pcm.byteLength / BYTES_PER_MS
    const msg: Record<string, unknown> = { message_type: 'input_audio_chunk', audio_base_64: toBase64(pcm), commit: false, sample_rate: 16000 }
    if (this.sendPrevious && this.previousText) msg.previous_text = this.previousText
    this.sendPrevious = false
    try { this.ws!.send(JSON.stringify(msg)) } catch (err) { this.log('rolling.send-failed', { error: String(err) }); this.scheduleReconnect() }
  }
}
