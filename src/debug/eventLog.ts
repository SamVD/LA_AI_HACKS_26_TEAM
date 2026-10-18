// Lean pipeline log (T-315): every `log(event, data)` call in the app also lands
// here, newest last, so the phone companion can export a device session as JSON for
// latency and accuracy analysis. In memory only, capped, never persisted, no audio
// (the app never logs audio). The UI lane reads it through `eventLog`.

export interface LogEntry {
  /** Wall clock (ms), the same clock modes use via ModeContext.now in production. */
  t: number
  event: string
  data?: unknown
}

export interface EventLog {
  record(event: string, data?: unknown, t?: number): void
  /** Oldest first. */
  entries(): LogEntry[]
  /** The whole log as pretty JSON, with `exportedAt` and the entry count. */
  toJSON(): string
  clear(): void
  /** Called after each record; returns an unsubscribe function. */
  subscribe(cb: (entry: LogEntry) => void): () => void
}

export function createEventLog(max = 2000, now: () => number = Date.now): EventLog {
  let list: LogEntry[] = []
  const listeners = new Set<(entry: LogEntry) => void>()
  return {
    record(event, data, t = now()) {
      const entry: LogEntry = data === undefined ? { t, event } : { t, event, data }
      list.push(entry)
      if (list.length > max) list = list.slice(-max)
      for (const cb of listeners) {
        try { cb(entry) } catch { /* a broken listener must not break logging */ }
      }
    },
    entries: () => [...list],
    toJSON() {
      const safe = (value: unknown) => {
        try { return JSON.parse(JSON.stringify(value)) as unknown } catch { return String(value) }
      }
      return JSON.stringify({
        exportedAt: new Date(now()).toISOString(),
        count: list.length,
        entries: list.map(e => (e.data === undefined ? e : { ...e, data: safe(e.data) })),
      }, null, 2)
    },
    clear() { list = [] },
    subscribe(cb) {
      listeners.add(cb)
      return () => { listeners.delete(cb) }
    },
  }
}

/** The app-wide log that `src/main.ts` feeds. */
export const eventLog: EventLog = createEventLog()
