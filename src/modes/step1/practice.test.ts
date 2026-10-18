import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mode, Transcript, WordEntry } from '../../core/types'
import { builtinBank } from '../../content'
import { createMockContext, MemoryStore, MockStt, MockUI } from '../../mocks'
import { createPracticeMode, EMPTY_PRACTICE_MESSAGE, maskWord, practiceItems, type PracticeResult } from './index'

const cup = builtinBank().find(entry => entry.id === 'cup')!
const water = builtinBank().find(entry => entry.id === 'water')!
const kitchen = builtinBank().find(entry => entry.id === 'kitchen')!
const active: Mode[] = []
const settle = () => vi.advanceTimersByTimeAsync(0)
// T-313: non-matching utterances under 250 ms don't count — fixtures default to a 400 ms attempt.
const transcript = (text: string, error?: Transcript['error']): Transcript =>
  ({ text, error, isFinal: true, tStartMs: 0, tEndMs: 400 })

function setup(words = [cup, water, kitchen], utterances: string[] = []) {
  const ui = new MockUI()
  const store = new MemoryStore(words)
  const context = createMockContext({ ui, store })
  const stt = new MockStt(undefined, { utterances, now: context.now, utteranceDelayMs: 40 })
  // Scripted utterances read as 400 ms attempts (≥ the T-313 250 ms minimum).
  const realTranscribe = stt.transcribeUtterance.bind(stt)
  stt.transcribeUtterance = async options => {
    const t = await realTranscribe(options)
    return { ...t, tStartMs: t.tEndMs - 400 }
  }
  context.stt = stt
  const mode = createPracticeMode({ random: () => 0 })
  active.push(mode)
  const advance = async (ms: number) => {
    context.clock.advance(ms)
    await vi.advanceTimersByTimeAsync(ms)
  }
  return { ui, store, stt, context, mode, advance }
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(async () => {
  for (const mode of active.splice(0)) await mode.exit()
  expect(vi.getTimerCount()).toBe(0)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('practice selection and masking', () => {
  it('chooses 10 unique non-sample targets in category rotation, with real frames', () => {
    const bank = builtinBank()
    const items = practiceItems(bank, () => 0)
    expect(items).toHaveLength(10)
    expect(new Set(items.map(item => item.entry.word)).size).toBe(10)
    expect(items.map(item => item.entry.category)).toEqual([
      'object', 'food', 'place', 'object', 'food', 'place', 'object', 'food', 'place', 'object',
    ])
    for (const item of items) {
      expect(item.entry.tags).not.toContain('sample')
      expect(item.entry.frames).toContain(item.frame)
    }
    expect(bank).toEqual(builtinBank())
  })
  it('handles a small bank, duplicate spellings, invalid frames and arbitrary RNG output', () => {
    const words: WordEntry[] = [cup, { ...cup, id: 'duplicate', word: 'CUP!' },
      { ...water, tags: ['sample'] }, { ...kitchen, frames: [] },
      { ...water, id: 'invalid', frames: ['no blank', '____ plus ____', '_____'] }]
    expect(practiceItems(words, () => NaN).map(item => item.entry.id)).toEqual(['cup'])
    expect(practiceItems([cup], () => 1)[0].frame).toBe(cup.frames.at(-1))
  })
  it('uses a seedable RNG for repeatable order and frame choice', () => {
    const rng = () => {
      let state = 17
      return () => { state = state * 16807 % 2147483647; return state / 2147483647 }
    }
    expect(practiceItems(builtinBank(), rng())).toEqual(practiceItems(builtinBank(), rng()))
    expect(practiceItems(builtinBank(), rng())).not.toEqual(practiceItems(builtinBank(), () => 0))
  })
  it.each([['cup', 'c_p'], ['spoon', 's___n'], ['at', 'a_'], ['a', 'a_'],
    ['ice cream', 'i__ ____m'], ['ice-cream', 'i__-____m'], ['café', 'c__é'], ['', '']])('masks %s as %s', (word, expected) => {
    expect(maskWord(word)).toBe(expected)
  })
})

describe('practice mode', () => {
  it('grades a correct cue-0 answer and advances after 1500ms', async () => {
    const s = setup(undefined, ['cup'])
    const transcribe = vi.spyOn(s.stt, 'transcribeUtterance')
    await s.mode.enter(s.context)
    expect(s.ui.last()).toEqual({ kind: 'prompt', sentence: cup.frames[0] })
    expect(transcribe).toHaveBeenCalledWith({ maxMs: 8000, endSilenceMs: 1200, targetHint: 'cup' })
    await s.advance(40)
    expect(s.ui.last()).toEqual({ kind: 'feedback', ok: true, word: 'cup' })
    expect(s.context.logs.find(log => log.event === 'step1.result')?.data).toMatchObject({ solvedAtCue: 0, attempts: 1, ms: 40 })
    await s.advance(1499)
    expect(s.ui.last()?.kind).toBe('feedback')
    await s.advance(1)
    expect(s.ui.last()).toEqual({ kind: 'prompt', sentence: water.frames[0] })
  })
  it('escalates twice without restarting the in-flight recording', async () => {
    const s = setup([cup], ['cup'])
    const transcribe = vi.spyOn(s.stt, 'transcribeUtterance')
    await s.mode.enter(s.context)
    s.ui.emit('SELECT')
    s.ui.emit('SELECT')
    await settle()
    expect(s.ui.screens.slice(0, 3)).toEqual([
      { kind: 'prompt', sentence: cup.frames[0] },
      { kind: 'cue', level: 1, word: 'cup', imageKey: 'cup', sentence: cup.frames[0] },
      { kind: 'cue', level: 2, word: 'cup', masked: 'c_p', sentence: cup.frames[0] },
    ])
    expect(transcribe).toHaveBeenCalledOnce()
    await s.advance(40)
    expect(s.context.logs.find(log => log.event === 'step1.result')?.data).toMatchObject({ solvedAtCue: 2 })
  })
  it('skips image-less personal targets to masked letters, then reveals the word', async () => {
    const custom = { ...cup, id: 'custom', word: 'lantern' }
    const s = setup([custom])
    await s.mode.enter(s.context)
    s.ui.emit('SELECT')
    await settle()
    expect(s.ui.last()).toMatchObject({ kind: 'cue', level: 2, masked: 'l_____n' })
    s.ui.emit('SELECT')
    s.ui.emit('SELECT')
    await settle()
    expect(s.ui.last()).toMatchObject({ kind: 'cue', level: 3, word: 'lantern' })
  })
  it('records a wrong answer then NEXT as skipped, and ignores PREV', async () => {
    const s = setup(undefined, ['nonsense'])
    await s.mode.enter(s.context)
    const screens = s.ui.screens.length
    s.ui.emit('PREV')
    expect(s.ui.screens).toHaveLength(screens)
    await s.advance(40)
    expect(s.ui.last()).toEqual({ kind: 'feedback', ok: false, word: 'nonsense' })
    s.ui.emit('NEXT')
    await settle()
    expect(s.ui.last()).toEqual({ kind: 'prompt', sentence: water.frames[0] })
    expect(s.context.logs.find(log => log.event === 'step1.result')?.data).toMatchObject({ word: 'cup', attempts: 1, skipped: true, solvedAtCue: null })
    expect(vi.getTimerCount()).toBe(1) // Only the new mock recording remains.
  })
  it('ignores a late transcript from a skipped item', async () => {
    const s = setup()
    const pending: Array<(result: Transcript) => void> = []
    const transcribe = vi.spyOn(s.stt, 'transcribeUtterance').mockImplementation(() =>
      new Promise(resolve => pending.push(resolve)))
    await s.mode.enter(s.context)
    s.ui.emit('NEXT')
    await settle()
    expect(transcribe).toHaveBeenCalledTimes(2)
    const screens = s.ui.screens.length
    pending[0](transcript('cup'))
    await settle()
    expect(s.ui.screens).toHaveLength(screens)
    pending[1](transcript('water'))
    await settle()
    expect(s.ui.last()).toEqual({ kind: 'feedback', ok: true, word: 'water' })
  })
  it('silence walks the ladder and ends unsolved with no timers left', async () => {
    const s = setup([cup])
    await s.mode.enter(s.context)
    await vi.runAllTimersAsync()
    expect(s.ui.screens.map(screen => screen.kind === 'cue' ? `cue${screen.level}` : screen.kind)).toEqual([
      'prompt', 'cue1', 'cue2', 'cue3', 'status',
    ])
    const session = (await s.store.getSessions('step1'))[0]
    expect(session.items).toEqual([expect.objectContaining({ word: 'cup', solvedAtCue: null, attempts: 0, skipped: false })])
    expect(vi.getTimerCount()).toBe(0)
  })
  it('auto-escalates one cue level when retrying a wrong answer after 1200ms', async () => {
    const s = setup([cup], ['nonsense', 'cup'])
    await s.mode.enter(s.context)
    s.ui.emit('SELECT')
    await s.advance(40)
    s.ui.emit('SELECT') // Ignored while feedback is visible.
    await s.advance(1199)
    expect(s.ui.last()?.kind).toBe('feedback')
    await s.advance(1)
    expect(s.ui.last()).toMatchObject({ kind: 'cue', level: 2 })
    await s.advance(40)
    expect(s.ui.last()).toEqual({ kind: 'feedback', ok: true, word: 'cup' })
    expect(s.context.logs.find(log => log.event === 'step1.result')?.data).toMatchObject({ solvedAtCue: 2, attempts: 2 })
  })
  it('auto-escalates a wrong answer from the prompt to the picture cue', async () => {
    const s = setup([cup], ['nonsense', 'cup'])
    await s.mode.enter(s.context)
    await s.advance(40)
    expect(s.ui.last()).toEqual({ kind: 'feedback', ok: false, word: 'nonsense' })
    await s.advance(1200)
    expect(s.ui.last()).toEqual({ kind: 'cue', level: 1, word: 'cup', imageKey: 'cup', sentence: cup.frames[0] })
    await s.advance(40)
    expect(s.ui.last()).toEqual({ kind: 'feedback', ok: true, word: 'cup' })
    expect(s.context.logs.find(log => log.event === 'step1.result')?.data).toMatchObject({ solvedAtCue: 1, attempts: 2 })
  })
  it('skips the picture cue on auto-escalation for image-less personal targets', async () => {
    const custom = { ...cup, id: 'custom', word: 'lantern' }
    const s = setup([custom], ['nonsense', 'lantern'])
    await s.mode.enter(s.context)
    await s.advance(40)
    await s.advance(1200)
    expect(s.ui.last()).toMatchObject({ kind: 'cue', level: 2, masked: 'l_____n' })
    await s.advance(40)
    expect(s.ui.last()).toEqual({ kind: 'feedback', ok: true, word: 'lantern' })
    expect(s.context.logs.find(log => log.event === 'step1.result')?.data).toMatchObject({ solvedAtCue: 2 })
  })
  it('auto-escalates to the word after wrong answers at the prompt and masked cue', async () => {
    const s = setup([cup], ['nonsense', 'nonsense', 'nonsense', 'cup'])
    await s.mode.enter(s.context)
    await s.advance(40) // Wrong at L0 → L1.
    await s.advance(1240) // Feedback 1200ms, then wrong at L1 → L2.
    await s.advance(1240) // Feedback 1200ms, then wrong at L2 → L3.
    await s.advance(1200) // L3 shown after the wrong-at-L2 feedback delay.
    expect(s.ui.screens.filter(screen => screen.kind === 'cue').map(screen => screen.level)).toEqual([1, 2, 3])
    await s.advance(40)
    expect(s.ui.last()).toEqual({ kind: 'feedback', ok: true, word: 'cup' })
    expect(s.context.logs.find(log => log.event === 'step1.result')?.data).toMatchObject({ solvedAtCue: 3, attempts: 4 })
  })
  it('advances unsolved after three wrong answers at cue 3', async () => {
    const s = setup([cup], ['nonsense', 'nonsense', 'nonsense'])
    await s.mode.enter(s.context)
    for (let i = 0; i < 3; i++) s.ui.emit('SELECT')
    await vi.runAllTimersAsync()
    const item = (await s.store.getSessions('step1'))[0].items[0] as PracticeResult
    expect(item).toMatchObject({ solvedAtCue: null, attempts: 3, skipped: false })
    expect(s.ui.last()).toMatchObject({ kind: 'status', text: 'Done! 0 of 1. 0 without help. Tap for more, double-tap to leave.' })
  })
  it('ignores a non-matching utterance under 250 ms — cue and attempt count unchanged', async () => {
    const s = setup([cup])
    vi.spyOn(s.stt, 'transcribeUtterance')
      .mockResolvedValueOnce({ ...transcript('um'), tEndMs: 150 })
      .mockResolvedValueOnce(transcript('cup'))
    await s.mode.enter(s.context)
    await settle()
    expect(s.context.logs.find(log => log.event === 'step1 ignored')?.data)
      .toMatchObject({ reason: 'too-short', ms: 150 })
    await settle()
    expect(s.ui.last()).toEqual({ kind: 'feedback', ok: true, word: 'cup' })
    expect(s.context.logs.find(log => log.event === 'step1.result')?.data)
      .toMatchObject({ solvedAtCue: 0, attempts: 1 })
    expect(s.ui.screens.filter(screen => screen.kind === 'cue')).toHaveLength(0)
  })
  it('ignores speech tagged as the partner (speaker: other)', async () => {
    const s = setup([cup])
    vi.spyOn(s.stt, 'transcribeUtterance')
      .mockResolvedValueOnce({ ...transcript('nonsense'), speaker: 'other' })
      .mockResolvedValueOnce(transcript('cup'))
    await s.mode.enter(s.context)
    await settle()
    expect(s.context.logs.find(log => log.event === 'step1 ignored')?.data)
      .toMatchObject({ reason: 'other-speaker' })
    await settle()
    expect(s.ui.last()).toEqual({ kind: 'feedback', ok: true, word: 'cup' })
    expect(s.context.logs.find(log => log.event === 'step1.result')?.data)
      .toMatchObject({ solvedAtCue: 0, attempts: 1 })
  })
  it('still counts a 250 ms wrong answer and auto-escalates (T-108 unchanged)', async () => {
    const s = setup([cup])
    vi.spyOn(s.stt, 'transcribeUtterance')
      .mockResolvedValueOnce({ ...transcript('nonsense'), tEndMs: 250 })
      .mockResolvedValueOnce(transcript('cup'))
    await s.mode.enter(s.context)
    await settle()
    expect(s.context.logs.some(log => log.event === 'step1 ignored')).toBe(false)
    await s.advance(1200)
    expect(s.ui.screens.filter(screen => screen.kind === 'cue').map(screen => screen.level)).toEqual([1])
    await settle()
    expect(s.ui.last()).toEqual({ kind: 'feedback', ok: true, word: 'cup' })
    expect(s.context.logs.find(log => log.event === 'step1.result')?.data)
      .toMatchObject({ solvedAtCue: 1, attempts: 2 })
  })
  it('accepts a correct answer at 200 ms and records solvedAtCue', async () => {
    const s = setup([cup])
    vi.spyOn(s.stt, 'transcribeUtterance')
      .mockResolvedValueOnce({ ...transcript('cup'), tEndMs: 200 })
    await s.mode.enter(s.context)
    await settle()
    expect(s.context.logs.some(log => log.event === 'step1 ignored')).toBe(false)
    expect(s.ui.last()).toEqual({ kind: 'feedback', ok: true, word: 'cup' })
    expect(s.context.logs.find(log => log.event === 'step1.result')?.data)
      .toMatchObject({ solvedAtCue: 0, attempts: 1 })
  })
  it.each(['mic-denied', 'network', 'timeout', 'unknown'] as const)('shows %s and SELECT retries', async error => {
    const s = setup([cup])
    const transcribe = vi.spyOn(s.stt, 'transcribeUtterance')
      .mockResolvedValueOnce(transcript('', error)).mockResolvedValueOnce(transcript('cup'))
    await s.mode.enter(s.context)
    await settle()
    expect(s.ui.last()?.kind).toBe('status')
    expect(s.context.logs.some(log => log.event === 'step1.error')).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    s.ui.emit('SELECT')
    await settle()
    expect(transcribe).toHaveBeenCalledTimes(2)
    expect(s.ui.last()).toEqual({ kind: 'feedback', ok: true, word: 'cup' })
  })
  it('defensively handles a rejecting service and empty text without an error code', async () => {
    const s = setup([cup])
    vi.spyOn(s.stt, 'transcribeUtterance').mockRejectedValueOnce(new Error('provider failed'))
      .mockResolvedValueOnce(transcript('')).mockResolvedValueOnce(transcript('cup'))
    await s.mode.enter(s.context)
    await settle()
    expect(s.ui.last()).toMatchObject({ kind: 'status', text: 'Could not hear you. Tap to try again.' })
    s.ui.emit('SELECT')
    await settle()
    expect(s.ui.last()).toEqual({ kind: 'feedback', ok: true, word: 'cup' })
    expect(s.context.logs.find(log => log.event === 'step1.result')?.data).toMatchObject({ solvedAtCue: 1 })
  })
  it('completes and saves ten items once, then supports another session', async () => {
    const bank = builtinBank()
    const answers = practiceItems(bank, () => 0).map(item => item.entry.word)
    const s = setup(bank, [...answers, ...answers])
    const save = vi.spyOn(s.store, 'saveSession')
    const leave = vi.fn()
    s.context.leave = leave
    await s.mode.enter(s.context)
    await vi.runAllTimersAsync()
    expect(save).toHaveBeenCalledOnce()
    const first = (await s.store.getSessions('step1'))[0]
    expect(first.items).toHaveLength(10)
    expect(first.items.every(item => (item as PracticeResult).solvedAtCue === 0)).toBe(true)
    expect(s.ui.last()).toEqual({ kind: 'status', text: 'Done! 10 of 10. 10 without help. Tap for more, double-tap to leave.' })
    s.ui.emit('SELECT')
    await settle()
    await vi.runAllTimersAsync()
    expect(save).toHaveBeenCalledTimes(2)
    s.ui.emit('BACK')
    await settle()
    expect(save).toHaveBeenCalledTimes(2)
    expect(leave).toHaveBeenCalledOnce()
  })
  it('BACK saves an attempted partial item before leaving and ignores later intents', async () => {
    const s = setup(undefined, ['nonsense'])
    const leave = vi.fn()
    s.context.leave = leave
    await s.mode.enter(s.context)
    await s.advance(40)
    s.ui.emit('BACK')
    s.ui.emit('BACK')
    await settle()
    expect(leave).toHaveBeenCalledOnce()
    const sessions = await s.store.getSessions('step1')
    expect(sessions).toHaveLength(1)
    expect(sessions[0].items).toEqual([expect.objectContaining({ wordId: 'cup', attempts: 1, skipped: false })])
    const screens = s.ui.screens.length
    s.ui.emit('SELECT')
    s.ui.emit('NEXT')
    await settle()
    expect(s.ui.screens).toHaveLength(screens)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('does not save an untouched session when BACK happens before the first answer', async () => {
    const s = setup()
    s.context.leave = vi.fn()
    await s.mode.enter(s.context)
    s.ui.emit('BACK')
    await settle()
    expect(await s.store.getSessions()).toEqual([])
    expect(s.context.leave).toHaveBeenCalledOnce()
  })
  it('does not reclassify a solved item as skipped when NEXT is pressed during feedback', async () => {
    const s = setup(undefined, ['cup'])
    await s.mode.enter(s.context)
    await s.advance(40)
    s.ui.emit('NEXT')
    await settle()
    s.ui.emit('BACK')
    await settle()
    expect((await s.store.getSessions())[0].items).toEqual([
      expect.objectContaining({ word: 'cup', solvedAtCue: 0, skipped: false }),
    ])
  })
  it('exits while recording and can be exited twice without timers or callbacks', async () => {
    const s = setup(undefined, ['cup'])
    await s.mode.enter(s.context)
    const screens = s.ui.screens.length
    await s.mode.exit()
    await s.mode.exit()
    s.ui.emit('NEXT')
    s.ui.emit('SELECT')
    await vi.runAllTimersAsync()
    expect(s.ui.screens).toHaveLength(screens)
    expect(await s.store.getSessions()).toEqual([])
  })
  it('does not start a stale recording after a delayed prompt render finishes', async () => {
    const s = setup()
    const original = s.ui.show.bind(s.ui)
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    vi.spyOn(s.ui, 'show').mockImplementationOnce(async screen => { await original(screen); await pending })
    const transcribe = vi.spyOn(s.stt, 'transcribeUtterance')
    const entering = s.mode.enter(s.context)
    await settle()
    s.ui.emit('NEXT')
    await settle()
    expect(s.ui.last()).toEqual({ kind: 'prompt', sentence: water.frames[0] })
    release()
    await entering
    expect(transcribe).toHaveBeenCalledOnce()
    expect(transcribe).toHaveBeenLastCalledWith(expect.objectContaining({ targetHint: 'water' }))
  })
  it('keeps the microphone warm during rapid skips and stops on exit', async () => {
    const s = setup()
    const transcribe = vi.spyOn(s.stt, 'transcribeUtterance')
    const stop = vi.spyOn(s.stt, 'stop')
    await s.mode.enter(s.context)
    s.ui.emit('NEXT')
    await settle()
    s.ui.emit('NEXT')
    await settle()
    expect(stop).not.toHaveBeenCalled()
    expect(transcribe).toHaveBeenCalledTimes(3)
    expect(transcribe).toHaveBeenLastCalledWith(expect.objectContaining({ targetHint: 'kitchen' }))
    await s.mode.exit()
    expect(stop).toHaveBeenCalledOnce()
  })
  it('preserves the warm microphone across correct-answer feedback and the next item', async () => {
    const s = setup(undefined, ['cup'])
    const stop = vi.spyOn(s.stt, 'stop')
    await s.mode.enter(s.context)
    await s.advance(1540)
    expect(s.ui.last()).toEqual({ kind: 'prompt', sentence: water.frames[0] })
    expect(stop).not.toHaveBeenCalled()
  })
  it('cleans up the old context before re-entering the same mode instance', async () => {
    const first = setup([cup], ['cup'])
    const second = setup([water], ['water'])
    await first.mode.enter(first.context)
    const screens = first.ui.screens.length
    await first.mode.enter(second.context)
    await second.advance(40)
    expect(first.ui.screens).toHaveLength(screens)
    expect(second.ui.last()).toEqual({ kind: 'feedback', ok: true, word: 'water' })
    expect(first.context.logs.filter(log => log.event === 'step1.result')).toEqual([])
  })
  it('keeps a failing renderer from starting the microphone and allows SELECT to retry', async () => {
    const s = setup([cup], ['cup'])
    vi.spyOn(s.ui, 'show').mockRejectedValueOnce(new Error('display unavailable'))
    const transcribe = vi.spyOn(s.stt, 'transcribeUtterance')
    await s.mode.enter(s.context)
    expect(transcribe).not.toHaveBeenCalled()
    s.ui.emit('SELECT')
    await settle()
    await s.advance(40)
    expect(s.ui.last()).toEqual({ kind: 'feedback', ok: true, word: 'cup' })
  })
  it('ignores bank loading that finishes after exit', async () => {
    const s = setup()
    let resolve!: (words: WordEntry[]) => void
    vi.spyOn(s.store, 'getBank').mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const entering = s.mode.enter(s.context)
    await settle()
    await s.mode.exit()
    resolve([cup])
    await entering
    expect(s.ui.screens).toEqual([])
  })
  it('shares an in-flight save when BACK arrives while summary persistence is pending', async () => {
    const s = setup([cup], ['cup'])
    let resolve!: () => void
    const save = vi.spyOn(s.store, 'saveSession').mockImplementationOnce(() => new Promise(done => { resolve = done }))
    s.context.leave = vi.fn()
    await s.mode.enter(s.context)
    await s.advance(1540)
    expect(save).toHaveBeenCalledOnce()
    s.ui.emit('BACK')
    await settle()
    resolve()
    await settle()
    expect(save).toHaveBeenCalledOnce()
    expect(s.context.leave).toHaveBeenCalledOnce()
    expect(s.ui.last()?.kind).toBe('feedback') // No late summary after leaving.
  })
  it('offers a retry if saving fails and keeps the same completed session', async () => {
    const s = setup([cup], ['cup'])
    const original = s.store.saveSession.bind(s.store)
    const save = vi.spyOn(s.store, 'saveSession').mockRejectedValueOnce(new Error('storage failed')).mockImplementation(original)
    await s.mode.enter(s.context)
    await vi.runAllTimersAsync()
    expect(s.ui.last()).toMatchObject({ kind: 'status', text: 'Could not save progress. Tap to try again.' })
    s.ui.emit('SELECT')
    await settle()
    expect(save).toHaveBeenCalledTimes(2)
    expect((await s.store.getSessions())[0].items).toHaveLength(1)
    expect(s.ui.last()).toMatchObject({ kind: 'status', text: 'Done! 1 of 1. 1 without help. Tap for more, double-tap to leave.' })
  })
  it('handles an empty bank and reloads it on SELECT', async () => {
    const s = setup([])
    await s.mode.enter(s.context)
    expect(s.ui.last()).toEqual({ kind: 'status', text: EMPTY_PRACTICE_MESSAGE })
    expect(vi.getTimerCount()).toBe(0)
    await s.store.addWord(cup)
    s.ui.emit('SELECT')
    await settle()
    expect(s.ui.last()).toEqual({ kind: 'prompt', sentence: cup.frames[0] })
  })
  it('lets the user retry after a word-bank read failure', async () => {
    const s = setup([cup])
    const original = s.store.getBank.bind(s.store)
    vi.spyOn(s.store, 'getBank').mockRejectedValueOnce(new Error('read failed')).mockImplementation(original)
    await s.mode.enter(s.context)
    expect(s.ui.last()).toMatchObject({ kind: 'status', text: 'Could not load words. Tap to try again.' })
    s.ui.emit('SELECT')
    await settle()
    expect(s.ui.last()?.kind).toBe('prompt')
  })
})
