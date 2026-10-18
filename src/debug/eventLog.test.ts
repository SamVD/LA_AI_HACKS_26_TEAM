import { describe, expect, it } from 'vitest'
import { createEventLog } from './eventLog'

describe('eventLog (T-315)', () => {
  it('records in order with timestamps and caps the size', () => {
    let t = 0
    const log = createEventLog(3, () => ++t)
    for (const e of ['a', 'b', 'c', 'd']) log.record(e, { e })
    expect(log.entries().map(x => [x.t, x.event])).toEqual([[2, 'b'], [3, 'c'], [4, 'd']])
  })

  it('exports JSON even when data is not serialisable', () => {
    const log = createEventLog(10, () => 5)
    const loop: Record<string, unknown> = {}
    loop.self = loop
    log.record('ok', { ms: 12 })
    log.record('loop', loop)
    log.record('bare')
    const out = JSON.parse(log.toJSON())
    expect(out.count).toBe(3)
    expect(out.entries[0]).toEqual({ t: 5, event: 'ok', data: { ms: 12 } })
    expect(typeof out.entries[1].data).toBe('string')
    expect(out.entries[2]).toEqual({ t: 5, event: 'bare' })
  })

  it('notifies subscribers and survives a throwing one', () => {
    const log = createEventLog()
    const seen: string[] = []
    log.subscribe(() => { throw new Error('boom') })
    const off = log.subscribe(e => seen.push(e.event))
    log.record('x')
    off()
    log.record('y')
    expect(seen).toEqual(['x'])
  })
})
