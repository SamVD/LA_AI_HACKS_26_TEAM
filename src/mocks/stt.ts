import type { SpeechState, SttService, Transcript, UtteranceOptions } from '../core/types'
import type { ConversationFixture } from './fixtures'

interface MockSttOptions {
  utterances?: string[]
  now?: () => number
  utteranceDelayMs?: number
}

export class MockStt implements SttService {
  private transcripts = new Set<(transcript: Transcript) => void>()
  private speech = new Set<(state: SpeechState) => void>()
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private pending = new Set<() => void>()
  private utterances: string[]
  private now: () => number
  private delayMs: number
  private running = false

  constructor(private fixture: ConversationFixture = {
    id: 'empty', description: 'No scripted conversation', events: [], stalls: [],
  }, options: MockSttOptions = {}) {
    this.utterances = [...(options.utterances ?? [])]
    this.now = options.now ?? Date.now
    this.delayMs = options.utteranceDelayMs ?? 20
  }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    const origin = this.now()
    for (const event of this.fixture.events) {
      this.schedule(() => {
        if (event.type === 'speech') {
          for (const callback of [...this.speech]) {
            callback({ speaking: event.speaking, tMs: origin + event.tMs })
          }
        } else {
          const transcript: Transcript = {
            text: event.text, isFinal: event.isFinal,
            tStartMs: origin + event.tStartMs, tEndMs: origin + event.tMs,
          }
          for (const callback of [...this.transcripts]) callback(transcript)
        }
      }, event.tMs)
    }
  }

  async stop(): Promise<void> {
    this.running = false
    for (const timer of this.timers) clearTimeout(timer)
    this.timers.clear()
    for (const cancel of [...this.pending]) cancel()
  }

  onTranscript(callback: (transcript: Transcript) => void): () => void {
    this.transcripts.add(callback)
    return () => { this.transcripts.delete(callback) }
  }

  onSpeechState(callback: (state: SpeechState) => void): () => void {
    this.speech.add(callback)
    return () => { this.speech.delete(callback) }
  }

  transcribeUtterance(options: UtteranceOptions): Promise<Transcript> {
    const tStartMs = this.now()
    const text = this.utterances.shift() ?? ''
    return new Promise(resolve => {
      const finish = (cancelled = false) => {
        this.pending.delete(cancel)
        resolve({
          text: cancelled ? '' : text, isFinal: true, tStartMs, tEndMs: this.now(),
          ...(!text || cancelled ? { error: 'no-speech' as const } : {}),
        })
      }
      const cancel = () => finish(true)
      this.pending.add(cancel)
      this.schedule(() => finish(), Math.max(0, Math.min(this.delayMs, options.maxMs)))
    })
  }

  private schedule(callback: () => void, delay: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      callback()
    }, delay)
    this.timers.add(timer)
  }
}
