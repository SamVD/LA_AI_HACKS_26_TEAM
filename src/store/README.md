# On-device store

`createStore(kv, builtin, { debounceMs = 500, maxSessions = 50 })` uses the
`KeyValueStore` supplied by the app shell. No SDK or browser globals are needed.
`memoryKeyValue()` provides an isolated adapter for tests or an in-memory app.

Bank and session data load lazily once. The store returns defensive copies.
Personal entries replace builtins with matching ids; removing a builtin adds a
tombstone, and adding it again clears the tombstone. Sessions are sorted by
`startedAt`, newest first, and capped across all modes before mode filtering.

Changes update memory immediately and debounce writes under `nudge.bank.v1`
and `nudge.sessions.v1`. Await `store.flush()` when leaving the app or before
an operation that needs confirmed persistence. Flushes serialize writes and
include changes made during an in-flight write. Only changed keys are written.

Malformed JSON or a wrong stored schema resets that key in memory; the next
mutation repairs its persisted data. Read failures keep the store usable in
memory. Failed background writes remain dirty and retry on the next mutation
or explicit flush. An explicit `flush()` rejects on adapter failure so the
shell can report it; it does not discard the in-memory data.
