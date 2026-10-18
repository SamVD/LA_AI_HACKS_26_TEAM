/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationFixture } from '../../mocks/fixtures'
import { MockStt } from '../../mocks/stt'
import { attachStallDetector } from './attach'
import { createStallDetector, type StallDetector, type StallSignal } from './detector'

const fixtures = import.meta.glob<ConversationFixture>('../../../fixtures/conversations/*.json', { eager: true, import: 'default' })
const fixture = (id: string) => Object.values(fixtures).find(f => f.id === id)!

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('attachStallDetector', () => {
  it('turns a replayed conversation (MockStt, real event stream) into hints at the annotated stalls', async () => {
    const fx = fixture('clean-stall')
    const stt = new MockStt(fx, { now: Date.now })
    const t0 = Date.now()
    const hints: StallSignal[] = []
    const detach = attachStallDetector(stt, createStallDetector(), s => hints.push(s), { now: Date.now })
    await stt.start()
    await vi.advanceTimersByTimeAsync(60_000)
    detach()
    await stt.stop()
    // clean-stall has two stalls; the second ("I need the door") ends on a content word (missed by design).
    expect(hints.map(h => h.silenceStartMs - t0)).toEqual([fx.stalls[0].tMs])
    expect(hints[0].stalledAfter).toBe(fx.stalls[0].stalledAfter)
    expect(hints[0].tMs - hints[0].silenceStartMs).toBeGreaterThanOrEqual(1500)
    expect(hints[0].tMs - hints[0].silenceStartMs).toBeLessThan(1500 + 200 + 1) // one tick of slack
  })

  it('stays silent through a conversation with no stalls', async () => {
    const stt = new MockStt(fixture('no-stall'), { now: Date.now })
    const hints: StallSignal[] = []
    const detach = attachStallDetector(stt, createStallDetector(), s => hints.push(s))
    await stt.start()
    await vi.advanceTimersByTimeAsync(90_000)
    detach()
    expect(hints).toEqual([])
  })

  it('detaches and reports once if the detector throws, so Step 3 can fall back to Step 2', async () => {
    const stt = new MockStt(fixture('clean-stall'), { now: Date.now })
    const boom: StallDetector = { onEvent: () => { throw new Error('boom') }, nextCheckMs: () => 0, reset: () => {} }
    const onError = vi.fn()
    const onStall = vi.fn()
    attachStallDetector(stt, boom, onStall, { onError })
    await stt.start()
    await vi.advanceTimersByTimeAsync(60_000) // past the end of clean-stall (~47 s), so MockStt's own timers are done
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onStall).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0) // and our tick interval was cleared on the first throw
  })

  it('detach() stops all events and the timer', async () => {
    const stt = new MockStt(fixture('clean-stall'), { now: Date.now })
    const onStall = vi.fn()
    const detach = attachStallDetector(stt, createStallDetector(), onStall)
    detach()
    await stt.start()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(onStall).not.toHaveBeenCalled()
  })
})
