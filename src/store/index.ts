import type { KeyValueStore, ModeId, SessionRecord, Store, WordEntry } from '../core/types'

const BANK_KEY = 'nudge.bank.v1'
const SESSIONS_KEY = 'nudge.sessions.v1'
const categories = new Set(['object', 'food', 'person', 'place', 'medication', 'other'])
const modes = new Set(['step1', 'step2', 'step3'])
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string')
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

function validWord(value: unknown): value is WordEntry {
  return object(value) && typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.word === 'string' && value.word.length > 0 && categories.has(value.category as string) &&
    strings(value.frames) && strings(value.tags) &&
    (value.imageKey === undefined || typeof value.imageKey === 'string') &&
    (value.firstSound === undefined || typeof value.firstSound === 'string')
}

function validSession(value: unknown): value is SessionRecord {
  return object(value) && modes.has(value.mode as string) && finite(value.startedAt) &&
    (value.endedAt === undefined || finite(value.endedAt)) && Array.isArray(value.items)
}

export function memoryKeyValue(): KeyValueStore {
  const values = new Map<string, string>()
  return {
    async get(key) { return values.get(key) ?? null },
    async set(key, value) { values.set(key, value) },
  }
}

/** On-device Store; the caller supplies an SDK-backed or in-memory adapter. */
export function createStore(
  kv: KeyValueStore,
  builtin: WordEntry[],
  opts: { debounceMs?: number; maxSessions?: number } = {},
): Store & { flush(): Promise<void> } {
  const base = new Map(builtin.map(entry => [entry.id, structuredClone(entry)]))
  const added = new Map<string, WordEntry>()
  const removed = new Set<string>()
  let sessions: SessionRecord[] = []
  const debounceMs = finite(opts.debounceMs) ? Math.max(0, opts.debounceMs) : 500
  const maxSessions = finite(opts.maxSessions) ? Math.max(0, Math.floor(opts.maxSessions)) : 50
  let loading: Promise<void> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let bankVersion = 0
  let savedBank = 0
  let sessionVersion = 0
  let savedSessions = 0
  let writes = Promise.resolve()

  async function read(key: string): Promise<unknown> {
    try {
      const value = await kv.get(key)
      return value === null ? null : JSON.parse(value)
    } catch { return null }
  }

  function load(): Promise<void> {
    loading ??= Promise.all([read(BANK_KEY), read(SESSIONS_KEY)]).then(([bank, records]) => {
      if (object(bank)) {
        // Salvage valid records independently: one damaged personal word or
        // tombstone must not erase the rest on the next successful write.
        if (Array.isArray(bank.added)) {
          for (const entry of bank.added.filter(validWord)) added.set(entry.id, structuredClone(entry))
        }
        if (Array.isArray(bank.removed)) {
          for (const id of bank.removed) if (typeof id === 'string' && id.length > 0) removed.add(id)
        }
      }
      if (Array.isArray(records)) {
        sessions = records.filter(validSession).sort((a, b) => b.startedAt - a.startedAt).slice(0, maxSessions)
      }
    })
    return loading
  }

  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  function schedule() {
    clearTimer()
    // A failed background write stays dirty. A later mutation or explicit flush
    // retries it; never create an unhandled timer rejection.
    timer = setTimeout(() => { timer = undefined; void flush().catch(() => {}) }, debounceMs)
  }

  async function flush(): Promise<void> {
    clearTimer()
    await load()
    // Serialize writes: a slow BLE write must never overwrite newer state.
    writes = writes.catch(() => {}).then(async () => {
      while (bankVersion !== savedBank || sessionVersion !== savedSessions) {
        if (bankVersion !== savedBank) {
          const version = bankVersion
          await kv.set(BANK_KEY, JSON.stringify({ added: [...added.values()], removed: [...removed] }))
          savedBank = version
        }
        if (sessionVersion !== savedSessions) {
          const version = sessionVersion
          await kv.set(SESSIONS_KEY, JSON.stringify(sessions))
          savedSessions = version
        }
      }
      clearTimer()
    })
    return writes
  }

  return {
    async getBank() {
      await load()
      const bank = new Map([...base].filter(([id]) => !removed.has(id)))
      for (const [id, entry] of added) bank.set(id, entry)
      return structuredClone([...bank.values()])
    },
    async addWord(word) {
      const copy = structuredClone(word)
      await load()
      added.set(copy.id, copy)
      removed.delete(copy.id)
      bankVersion++
      schedule()
    },
    async removeWord(id) {
      await load()
      added.delete(id)
      if (base.has(id)) removed.add(id)
      bankVersion++
      schedule()
    },
    async saveSession(record) {
      const copy = structuredClone(record)
      await load()
      sessions = [copy, ...sessions].sort((a, b) => b.startedAt - a.startedAt).slice(0, maxSessions)
      sessionVersion++
      schedule()
    },
    async getSessions(mode?: ModeId) {
      await load()
      return structuredClone(sessions.filter(record => !mode || record.mode === mode))
    },
    flush,
  }
}
