import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PredictRequest, WordEntry } from '../core/types'
import { readFlags, readInitialMode } from '../config'
import { EMPTY_PRACTICE_MESSAGE } from '../modes/step1'
import { getMode, modes } from '../modes'
import { ConsoleUI, createMockContext, MemoryStore, MockPredictor, MockStt, MockUI } from './index'
import type { ConversationFixture } from './fixtures'

const cup: WordEntry = {
  id: 'cup', word: 'cup', category: 'object', frames: ['Drink from a ____.'], tags: ['drink'],
}
const fixture: ConversationFixture = {
  id: 'test', description: 'Inline replay fixture', stalls: [], events: [
    { type: 'speech', tMs: 0, speaking: true },
    { type: 'transcript', tMs: 50, tStartMs: 0, text: 'a', isFinal: false },
    { type: 'transcript', tMs: 100, tStartMs: 0, text: 'a cup', isFinal: true },
    { type: 'speech', tMs: 100, speaking: false },
  ],
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('configuration', () => {
  it('defaults every flag off and mode to step1', () => {
    expect(readFlags('', {})).toEqual({
      mockServices: false, step2Enabled: false, step3Enabled: false, imuEnabled: false,
    })
    expect(readInitialMode('', {})).toBe('step1')
  })
  it('reads environment values and URL overrides, including explicit off', () => {
    const env = { VITE_SVC: 'mock', VITE_STEP2: '1', VITE_STEP3: '1', VITE_IMU: '1' }
    expect(Object.values(readFlags('', env))).toEqual([true, true, true, true])
    expect(readFlags('?svc=real&step2=0&step3=&imu=0', env)).toEqual(readFlags('', {}))
    expect(readFlags('?svc=mock&step2=1', {})).toMatchObject({ mockServices: true, step2Enabled: true })
    expect(readInitialMode('?mode=step2', { VITE_MODE: 'step3' })).toBe('step2')
    expect(readInitialMode('?mode=unknown', {})).toBe('step1')
    expect(readInitialMode('?mode=step3', {})).toBe('step3')
  })
})

describe('UI and registered modes', () => {
  it.each(['step1', 'step2', 'step3'] as const)('enters and exits %s', async id => {
    const ui = new MockUI()
    const context = createMockContext({ ui })
    expect(getMode(id)).toBe(modes[id])
    await getMode(id).enter(context)
    const last = ui.last()
    if (id === 'step1') {
      expect(last).toEqual({ kind: 'status', text: EMPTY_PRACTICE_MESSAGE })
    } else if (id === 'step2') {
      // The default mock flags have step2Enabled off, so Step 2 shows its "off" status.
      expect(last).toEqual({ kind: 'status', text: 'Step 2 is turned off.\nDouble-tap to go back.' })
    } else {
      expect(last).toEqual({ kind: 'status', text: `${id} not built yet` })
    }
    await getMode(id).exit()
  })
  it('records snapshots and unsubscribes intent subscribers', async () => {
    const ui = new MockUI()
    const callback = vi.fn()
    const unsubscribe = ui.onIntent(callback)
    ui.emit('NEXT')
    unsubscribe()
    ui.emit('BACK')
    expect(callback.mock.calls).toEqual([['NEXT']])
    const screen = { kind: 'status' as const, text: 'original' }
    await ui.show(screen)
    screen.text = 'mutated'
    expect(ui.screens).toEqual([{ kind: 'status', text: 'original' }])
  })
  it('prints ConsoleUI screens', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await new ConsoleUI().show({ kind: 'blank' })
    expect(log).toHaveBeenCalledWith('[nudge:screen]', { kind: 'blank' })
  })
  it('controls context time and records logs', () => {
    const context = createMockContext()
    context.clock.set(100)
    context.clock.advance(25)
    context.log('advance', { value: 1 })
    expect(context.now()).toBe(125)
    expect(context.logs).toEqual([{ event: 'advance', data: { value: 1 }, tMs: 125 }])
  })
})

describe('MockStt', () => {
  it('replays at exact offsets, in fixture order, on the context clock', async () => {
    vi.useFakeTimers()
    const stt = new MockStt(fixture, { now: () => 1000 })
    const received: unknown[] = []
    stt.onTranscript(t => received.push(t))
    stt.onSpeechState(s => received.push(s))
    await stt.start()
    await stt.start() // Starting an active replay is idempotent.
    await vi.advanceTimersByTimeAsync(49)
    expect(received).toEqual([{ speaking: true, tMs: 1000 }])
    await vi.advanceTimersByTimeAsync(1)
    expect(received.at(-1)).toEqual({ text: 'a', isFinal: false, tStartMs: 1000, tEndMs: 1050 })
    await vi.advanceTimersByTimeAsync(50)
    expect(received.slice(2)).toEqual([
      { text: 'a cup', isFinal: true, tStartMs: 1000, tEndMs: 1100 },
      { speaking: false, tMs: 1100 },
    ])
  })
  it('cancels timers and supports restarting and unsubscribing', async () => {
    vi.useFakeTimers()
    const stt = new MockStt(fixture)
    const transcript = vi.fn()
    const speech = vi.fn()
    const offTranscript = stt.onTranscript(transcript)
    const offSpeech = stt.onSpeechState(speech)
    await stt.start()
    await stt.stop()
    await vi.runAllTimersAsync()
    expect(transcript).not.toHaveBeenCalled()
    expect(speech).not.toHaveBeenCalled()
    offTranscript()
    offSpeech()
    await stt.start()
    await vi.runAllTimersAsync()
    expect(transcript).not.toHaveBeenCalled()
    expect(speech).not.toHaveBeenCalled()
  })
  it('resolves utterances and exhausted/cancelled calls without rejection', async () => {
    vi.useFakeTimers()
    const stt = new MockStt(fixture, { utterances: ['cup'] })
    const options = { maxMs: 8000, endSilenceMs: 1200 }
    const first = stt.transcribeUtterance(options)
    await vi.advanceTimersByTimeAsync(20)
    await expect(first).resolves.toMatchObject({ text: 'cup', isFinal: true })
    const empty = stt.transcribeUtterance(options)
    await vi.advanceTimersByTimeAsync(20)
    await expect(empty).resolves.toMatchObject({ text: '', error: 'no-speech' })
    const cancelled = stt.transcribeUtterance(options)
    await stt.stop()
    await expect(cancelled).resolves.toMatchObject({ text: '', error: 'no-speech' })
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('MockPredictor and MemoryStore', () => {
  const request: PredictRequest = { transcriptTail: 'pass me the', stalledAfter: ' THE ', bank: [cup], n: 1 }
  it('normalizes canned keys, limits results and returns defensive copies', async () => {
    const predictor = new MockPredictor({ ' the ': [{ word: 'spoon', confidence: 0.9, source: 'model' }] })
    const result = await predictor.predict(request)
    expect(result).toEqual([{ word: 'spoon', confidence: 0.9, source: 'model' }])
    result[0].word = 'changed'
    expect((await predictor.predict(request))[0].word).toBe('spoon')
    expect(await predictor.predict({ ...request, n: 0 })).toEqual([])
  })
  it('falls back to bank words and resolves abort with an empty list', async () => {
    const predictor = new MockPredictor()
    expect(await predictor.predict(request)).toEqual([{ word: 'cup', confidence: 0.1, source: 'bank' }])
    const abort = new AbortController()
    abort.abort()
    await expect(predictor.predict(request, abort.signal)).resolves.toEqual([])
  })
  it('upserts, removes, isolates stored data, and filters sorted sessions', async () => {
    const store = new MemoryStore([cup])
    await store.addWord({ ...cup, word: 'mug' })
    const bank = await store.getBank()
    expect(bank).toHaveLength(1)
    bank[0].tags.push('mutation')
    expect((await store.getBank())[0].tags).toEqual(['drink'])
    await store.removeWord('cup')
    expect(await store.getBank()).toEqual([])
    for (const [mode, startedAt] of [['step1', 10], ['step2', 30], ['step1', 20]] as const) {
      await store.saveSession({ mode, startedAt, items: [] })
    }
    expect((await store.getSessions()).map(s => s.startedAt)).toEqual([30, 20, 10])
    expect((await store.getSessions('step1')).map(s => s.startedAt)).toEqual([20, 10])
  })
})
