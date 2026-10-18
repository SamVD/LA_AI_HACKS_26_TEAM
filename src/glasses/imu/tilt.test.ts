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

describe('sideways roll (T-319): ear to shoulder = SELECT', () => {
  const REST_Y = -0.16
  const ROLL_RIGHT = -0.64 // S-3 tilt-right mean; Δ −0.48 from rest
  const ROLL_LEFT = -0.5 // deep end of the measured left pose (y range −0.70..−0.17)

  const repP = (x: number, y: number, n: number): [number, number][] => Array<[number, number]>(n).fill([x, y])

  /** Feeds 10 Hz (x, y) pairs; returns every fired direction. */
  function feedXY(d: ReturnType<typeof createTiltDetector>, pts: [number, number][], t0 = 0): TiltDir[] {
    const out: TiltDir[] = []
    pts.forEach(([x, y], i) => { const r = d.sample(x, t0 + i * 100, y); if (r) out.push(r) })
    return out
  }

  function armedXY() {
    const d = createTiltDetector()
    feedXY(d, repP(STILL, REST_Y, 20))
    d.arm(2000)
    return d
  }

  it('tilt right held 600 ms fires exactly one SELECT and no NEXT/PREV', () => {
    const pts = [...repP(STILL, REST_Y, 5), ...repP(-0.08, ROLL_RIGHT, 6), ...repP(STILL, REST_Y, 5)]
    expect(feedXY(armedXY(), pts, 2000)).toEqual(['SELECT'])
  })

  it('tilt left fires SELECT too', () => {
    // Left tilts sit shallower (mean −0.40, Δ 0.24); the held pose's deeper samples cross 0.28.
    const pts = [...repP(STILL, REST_Y, 5), ...repP(-0.02, ROLL_LEFT, 6), ...repP(STILL, REST_Y, 5)]
    expect(feedXY(armedXY(), pts, 2000)).toEqual(['SELECT'])
  })

  it('look down / up with a resting y still fire NEXT / PREV, never SELECT', () => {
    const pts = [
      ...repP(STILL, REST_Y, 5),
      ...repP(DOWN, REST_Y, 6),
      ...repP(STILL, REST_Y, 10),
      ...repP(UP, REST_Y, 6),
      ...repP(STILL, REST_Y, 5),
    ]
    expect(feedXY(armedXY(), pts, 2000)).toEqual(['NEXT', 'PREV'])
  })

  it('holding a roll for 2 s, then returning, fires only once', () => {
    const pts = [...repP(STILL, REST_Y, 3), ...repP(-0.08, ROLL_RIGHT, 20), ...repP(STILL, REST_Y, 10)]
    expect(feedXY(armedXY(), pts, 2000)).toEqual(['SELECT'])
  })

  it('a 2-sample roll wobble fires nothing', () => {
    const pts = [...repP(STILL, REST_Y, 5), ...repP(-0.08, ROLL_RIGHT, 2), ...repP(STILL, REST_Y, 10)]
    expect(feedXY(armedXY(), pts, 2000)).toEqual([])
  })

  it('a shallow roll (|Δy| ≥ 0.20, < 0.28) does not fire and suppresses x runs — roll wins', () => {
    // x = −0.25 would be NEXT on its own; a shallow roll (−0.40, the left pose mean) cancels it.
    const pts = [...repP(STILL, REST_Y, 5), ...repP(DOWN, -0.4, 6), ...repP(STILL, REST_Y, 10)]
    expect(feedXY(armedXY(), pts, 2000)).toEqual([])
  })

  it('fires again after coming back to rest from a roll', () => {
    const pts = [
      ...repP(STILL, REST_Y, 3),
      ...repP(-0.08, ROLL_RIGHT, 6),
      ...repP(STILL, REST_Y, 10),
      ...repP(-0.08, ROLL_RIGHT, 6),
    ]
    expect(feedXY(armedXY(), pts, 2000)).toEqual(['SELECT', 'SELECT'])
  })

  it('no y passed: identical to the x-only detector', () => {
    const d = armedDetector()
    expect(feed(d, [...rep(STILL, 5), ...rep(DOWN, 6), ...rep(STILL, 5)], 2000)).toEqual(['NEXT'])
  })
})
