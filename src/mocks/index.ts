import type { ModeContext } from '../core/types'
import { MockUI } from './ui'
import { MockStt } from './stt'
import { MockPredictor } from './predictor'
import { MemoryStore } from './store'

export { MockUI, ConsoleUI } from './ui'
export { MockStt } from './stt'
export { MockPredictor } from './predictor'
export { MemoryStore } from './store'
export type { ConversationFixture } from './fixtures'

export function createMockContext(overrides: Partial<ModeContext> = {}) {
  const clock = {
    timeMs: 0,
    set(timeMs: number) { this.timeMs = timeMs },
    advance(deltaMs: number) { this.timeMs += deltaMs },
  }
  const logs: Array<{ event: string; data?: unknown; tMs: number }> = []
  const now = overrides.now ?? (() => clock.timeMs)
  return {
    clock,
    logs,
    ui: new MockUI(),
    stt: new MockStt(undefined, { now }),
    predictor: new MockPredictor(),
    store: new MemoryStore(),
    now,
    log: (event: string, data?: unknown) => { logs.push({ event, data, tMs: now() }) },
    flags: { step2Enabled: false, step3Enabled: false, imuEnabled: false, mockServices: false },
    ...overrides,
  } satisfies ModeContext & { clock: typeof clock; logs: typeof logs }
}
