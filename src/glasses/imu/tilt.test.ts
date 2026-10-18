import { describe, expect, it } from 'vitest'
import { createTiltDetector, type TiltDir } from './tilt'

const STILL = 0.03
const DOWN = -0.25
const UP = 0.3

/** Feeds 10 Hz samples; returns every fired direction. */
function feed(d: ReturnType<typeof createTiltDetector>, xs: number[], t0 = 0): TiltDir[] {
  const out: TiltDir[] = []
  xs.forEach((x, i) => { const r = d.sample(x, t0 + i * 100); if (r) out.push(r) })
  return out
}
const rep = (x: number, n: number) => Array<number>(n).fill(x)

function armedDetector() {
  const d = createTiltDetector()
  feed(d, rep(STILL, 20))
  d.arm(2000)
  return d
}

describe('tilt detector', () => {
  it('still head fires nothing', () => {
    expect(feed(armedDetector(), rep(STILL, 50), 2000)).toEqual([])
  })
  it('look down held 600 ms fires exactly one NEXT', () => {
    expect(feed(armedDetector(), [...rep(STILL, 5), ...rep(DOWN, 6), ...rep(STILL, 5)], 2000)).toEqual(['NEXT'])
  })
  it('look up fires one PREV', () => {
    expect(feed(armedDetector(), [...rep(STILL, 5), ...rep(UP, 6), ...rep(STILL, 5)], 2000)).toEqual(['PREV'])
  })
  it('a 2-sample nod fires nothing', () => {
    expect(feed(armedDetector(), [...rep(STILL, 5), ...rep(DOWN, 2), ...rep(STILL, 10)], 2000)).toEqual([])
  })
  it('holding down for 3 s still fires only once', () => {
    expect(feed(armedDetector(), [...rep(STILL, 3), ...rep(DOWN, 30)], 2000)).toEqual(['NEXT'])
  })
  it('fires again after coming back to rest', () => {
    const xs = [...rep(DOWN, 6), ...rep(STILL, 10), ...rep(DOWN, 6)]
    expect(feed(armedDetector(), xs, 2000)).toEqual(['NEXT', 'NEXT'])
  })
  it('not armed fires nothing', () => {
    const d = createTiltDetector()
    expect(feed(d, [...rep(STILL, 20), ...rep(DOWN, 10)])).toEqual([])
    d.arm(3000)
    d.disarm()
    expect(feed(d, rep(DOWN, 10), 3000)).toEqual([])
  })
  it('rest follows the head: a different resting posture is not a tilt', () => {
    const d = createTiltDetector()
    feed(d, rep(0.3, 20))
    d.arm(2000)
    expect(feed(d, rep(0.3, 20), 2000)).toEqual([])
  })
  it('with too little history, rest comes from the next 3 samples', () => {
    const d = createTiltDetector()
    d.arm(0)
    expect(feed(d, [...rep(STILL, 3), ...rep(DOWN, 6)])).toEqual(['NEXT'])
  })
})
