import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KeyValueStore, SessionRecord, WordEntry } from '../core/types'
import { createStore, memoryKeyValue } from './index'

const cup: WordEntry = { id: 'cup', word: 'cup', category: 'object', frames: ['A ____.'], tags: ['kitchen'] }
const word: WordEntry = { id: 'pip', word: 'Pip', category: 'person', frames: [], tags: ['family'] }
const record = (startedAt: number, mode: SessionRecord['mode'] = 'step1'): SessionRecord =>
  ({ mode, startedAt, endedAt: startedAt + 1, items: [{ word: 'cup', solvedAtCue: 0 }] })
afterEach(() => { vi.useRealTimers() })

describe('persistent store', () => {
  it('loads lazily once, including simultaneous calls', async () => {
    const kv = memoryKeyValue()
    const get = vi.spyOn(kv, 'get')
    const store = createStore(kv, [cup])
    expect(get).not.toHaveBeenCalled()
    await Promise.all([store.getBank(), store.getSessions(), store.getBank()])
    expect(get).toHaveBeenCalledTimes(2)
  })
  it('upserts builtins and personal words without leaking mutable references', async () => {
    const kv = memoryKeyValue()
    const builtins = structuredClone([cup])
    const store = createStore(kv, builtins)
    builtins[0].word = 'modified input'
    expect((await store.getBank())[0].word).toBe('cup')
    const input = structuredClone(word)
    await store.addWord(input)
    input.tags.push('changed')
    await store.addWord({ ...cup, word: 'mug' })
    await store.addWord({ ...word, word: 'Pip Two' })
    const bank = await store.getBank()
    expect(bank.map(entry => entry.word)).toEqual(['mug', 'Pip Two'])
    expect(bank[1].tags).toEqual(['family'])
    bank[0].tags.push('external')
    expect((await store.getBank())[0].tags).not.toContain('external')
    await store.flush()
    expect(await createStore(kv, [cup]).getBank()).toEqual(await store.getBank())
  })
  it('persists builtin tombstones, deletes personal entries, and restores on upsert', async () => {
    const kv = memoryKeyValue()
    const store = createStore(kv, [cup])
    await store.addWord(word)
    await store.removeWord('cup')
    await store.removeWord('pip')
    await store.flush()
    expect(JSON.parse((await kv.get('nudge.bank.v1'))!)).toEqual({ added: [], removed: ['cup'] })
    const reopened = createStore(kv, [cup])
    expect(await reopened.getBank()).toEqual([])
    await reopened.addWord(cup)
    await reopened.flush()
    expect(await createStore(kv, [cup]).getBank()).toEqual([cup])
  })
  it('does not resurrect a builtin when deleting its personal override', async () => {
    const kv = memoryKeyValue()
    const store = createStore(kv, [cup])
    await store.addWord({ ...cup, word: 'mug' })
    await store.removeWord('cup')
    await store.flush()
    expect(await createStore(kv, [cup]).getBank()).toEqual([])
  })
  it('sorts newest first, caps globally, filters by mode and copies sessions', async () => {
    const kv = memoryKeyValue()
    const store = createStore(kv, [], { maxSessions: 3 })
    for (const session of [record(20), record(40, 'step2'), record(30), record(10)]) await store.saveSession(session)
    expect((await store.getSessions()).map(item => item.startedAt)).toEqual([40, 30, 20])
    expect((await store.getSessions('step1')).map(item => item.startedAt)).toEqual([30, 20])
    const sessions = await store.getSessions()
    sessions[0].items.push('changed')
    expect((await store.getSessions())[0].items).toHaveLength(1)
    await store.flush()
    expect(await createStore(kv, []).getSessions()).toEqual(await store.getSessions())
  })
  it('defaults to 50 sessions and supports a zero limit', async () => {
    const store = createStore(memoryKeyValue(), [])
    for (let i = 0; i < 52; i++) await store.saveSession(record(i))
    expect(await store.getSessions()).toHaveLength(50)
    await store.flush()
    const zero = createStore(memoryKeyValue(), [], { maxSessions: 0 })
    await zero.saveSession(record(1))
    expect(await zero.getSessions()).toEqual([])
    await zero.flush()
  })
  it('debounces writes and flushes immediately without leaving a timer', async () => {
    vi.useFakeTimers()
    const kv = memoryKeyValue()
    const set = vi.spyOn(kv, 'set')
    const store = createStore(kv, [cup])
    await store.addWord(word)
    await vi.advanceTimersByTimeAsync(400)
    await store.removeWord('cup')
    await vi.advanceTimersByTimeAsync(499)
    expect(set).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(set).toHaveBeenCalledTimes(1)
    await store.saveSession(record(10))
    await store.flush()
    expect(set).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
    await store.flush()
    expect(set).toHaveBeenCalledTimes(2)
  })
  it.each(['{broken', 'null', '[]', '{"added":[{"id":"broken"}],"removed":[]}',
    '{"added":[],"removed":[1]}', '{"added":[],"removed":"cup"}'])('recovers from corrupt bank %s', async raw => {
    const kv = memoryKeyValue()
    await kv.set('nudge.bank.v1', raw)
    await kv.set('nudge.sessions.v1', JSON.stringify([record(1)]))
    const store = createStore(kv, [cup])
    expect(await store.getBank()).toEqual([cup])
    expect(await store.getSessions()).toHaveLength(1)
    await store.addWord(word)
    await store.flush()
    expect(await createStore(kv, [cup]).getBank()).toHaveLength(2)
  })
  it.each(['{broken', '{}', 'null', '[{"mode":"bad","startedAt":1,"items":[]}]',
    '[{"mode":"step1","startedAt":"1","items":[]}]', '[{"mode":"step1","startedAt":1,"items":null}]'])('recovers from corrupt sessions %s', async raw => {
    const kv = memoryKeyValue()
    await kv.set('nudge.sessions.v1', raw)
    await kv.set('nudge.bank.v1', JSON.stringify({ added: [word], removed: ['cup'] }))
    const store = createStore(kv, [cup])
    expect(await store.getSessions()).toEqual([])
    expect(await store.getBank()).toEqual([word])
    await store.saveSession(record(3))
    await store.flush()
    expect(await createStore(kv, []).getSessions()).toEqual([record(3)])
  })
  it('keeps valid personal words and tombstones when neighboring entries are malformed', async () => {
    const kv = memoryKeyValue()
    await kv.set('nudge.bank.v1', JSON.stringify({
      added: [word, null, { ...word, id: 'bad', tags: 'family' }, { id: 'incomplete' }],
      removed: ['cup', 42, null],
    }))
    const store = createStore(kv, [cup])
    expect(await store.getBank()).toEqual([word])
    const other = { ...word, id: 'pip-two', word: 'Pip Two' }
    await store.addWord(other)
    await store.flush()
    expect(JSON.parse((await kv.get('nudge.bank.v1'))!)).toEqual({ added: [word, other], removed: ['cup'] })
    expect(await createStore(kv, [cup]).getBank()).toEqual([word, other])
  })
  it('loads additions even when the removed list is corrupt', async () => {
    const kv = memoryKeyValue()
    await kv.set('nudge.bank.v1', JSON.stringify({ added: [word], removed: 'cup' }))
    expect(await createStore(kv, [cup]).getBank()).toEqual([cup, word])
  })
  it('loads tombstones even when the added list is corrupt', async () => {
    const kv = memoryKeyValue()
    await kv.set('nudge.bank.v1', JSON.stringify({ added: { bad: true }, removed: ['cup'] }))
    expect(await createStore(kv, [cup]).getBank()).toEqual([])
  })
  it('recovers valid sessions individually and preserves them on the next write', async () => {
    const kv = memoryKeyValue()
    await kv.set('nudge.sessions.v1', JSON.stringify([
      record(10), null, { mode: 'step1', startedAt: '15', items: [] }, record(20, 'step2'),
    ]))
    const store = createStore(kv, [])
    expect(await store.getSessions()).toEqual([record(20, 'step2'), record(10)])
    await store.saveSession(record(30))
    await store.flush()
    expect(await createStore(kv, []).getSessions()).toEqual([record(30), record(20, 'step2'), record(10)])
  })
  it('continues in memory if storage reads fail', async () => {
    const kv: KeyValueStore = { get: async () => { throw new Error('unavailable') }, set: async () => {} }
    const store = createStore(kv, [cup])
    expect(await store.getBank()).toEqual([cup])
    await store.addWord(word)
    expect(await store.getBank()).toHaveLength(2)
    await store.flush()
  })
  it('retries failed background writes on flush', async () => {
    vi.useFakeTimers()
    const kv = memoryKeyValue()
    const original = kv.set
    const set = vi.spyOn(kv, 'set').mockRejectedValueOnce(new Error('BLE unavailable')).mockImplementation(original)
    const store = createStore(kv, [])
    await store.addWord(word)
    await vi.advanceTimersByTimeAsync(500)
    expect(set).toHaveBeenCalledTimes(1)
    await store.flush()
    expect(set).toHaveBeenCalledTimes(2)
    expect(await createStore(kv, []).getBank()).toEqual([word])
  })
  it('serializes overlapping flushes and includes mutations during an awaited write', async () => {
    const kv = memoryKeyValue()
    const original = kv.set
    let release!: () => void
    const firstWrite = new Promise<void>(resolve => { release = resolve })
    let started!: () => void
    const writing = new Promise<void>(resolve => { started = resolve })
    vi.spyOn(kv, 'set').mockImplementationOnce(async (key, value) => {
      started()
      await firstWrite
      await original(key, value)
    }).mockImplementation(original)
    const store = createStore(kv, [])
    await store.addWord(word)
    const first = store.flush()
    await writing
    await store.addWord(cup)
    const second = store.flush()
    release()
    await Promise.all([first, second])
    expect((await createStore(kv, []).getBank()).map(entry => entry.id)).toEqual(['pip', 'cup'])
  })
  it('exposes explicit write failures and retains state for retry', async () => {
    const kv = memoryKeyValue()
    const original = kv.set
    vi.spyOn(kv, 'set').mockRejectedValueOnce(new Error('offline')).mockImplementation(original)
    const store = createStore(kv, [])
    await store.addWord(word)
    await expect(store.flush()).rejects.toThrow('offline')
    expect(await store.getBank()).toEqual([word])
    await store.flush()
    expect(await createStore(kv, []).getBank()).toEqual([word])
  })
})
