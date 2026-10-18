// Head tilt -> NEXT / PREV / SELECT. Pure: feed it IMU x samples (g), timestamps and,
// for sideways rolls, the y axis. Numbers come from the S-3 device spike: straight
// ahead x ≈ 0.03 / y ≈ −0.16, look up ≈ +0.30, look down ≈ −0.25, ear-to-shoulder
// y ≈ −0.40 (left) / −0.64 (right), about 10 samples/s.
export type TiltDir = 'NEXT' | 'PREV' | 'SELECT'

export interface TiltOptions {
  /** Distance from rest (g) that counts as a tilt. */
  fire?: number
  /** T-319: distance from restY (g) that counts as a sideways roll. */
  rollFire?: number
  /** T-319: while |Δy| is at least this, x runs aren't counted — a rolled head can't also look. */
  rollWin?: number
  /** Consecutive samples past `fire` before it triggers. */
  holdSamples?: number
  /** Distance from rest (g) the head must come back inside before the next fire. */
  deadZone?: number
  /** Samples inside the dead zone needed to re-arm. */
  rearmSamples?: number
  cooldownMs?: number
  /** How much history `arm` looks back over. */
  windowMs?: number
}

export interface TiltDetector {
  /** `y` (the roll axis) is optional: without it, NEXT/PREV behave exactly as before. */
  sample(x: number, tMs: number, y?: number): TiltDir | null
  /** Sets `rest` from the last 2 s (or the next 3 samples if there are fewer than 5). */
  arm(tMs: number): void
  disarm(): void
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function createTiltDetector(opts: TiltOptions = {}): TiltDetector {
  const fire = opts.fire ?? 0.18
  const rollFire = opts.rollFire ?? 0.28
  const rollWin = opts.rollWin ?? 0.2
  const holdSamples = opts.holdSamples ?? 4
  const deadZone = opts.deadZone ?? 0.1
  const rearmSamples = opts.rearmSamples ?? 2
  const cooldownMs = opts.cooldownMs ?? 700
  const windowMs = opts.windowMs ?? 2000

  let history: { x: number; t: number; y?: number }[] = []
  let armed = false
  let rest: number | null = null
  let restY: number | null = null
  let collecting: number[] | null = null
  let collectingY: number[] | null = null
  let lastFire = -Infinity
  let locked = false
  let inside = 0
  let run: { dir: TiltDir; n: number } | null = null

  function reset() { locked = false; inside = 0; run = null }

  return {
    arm(tMs) {
      armed = true
      reset()
      const recent = history.filter(h => h.t > tMs - windowMs).map(h => h.x)
      if (recent.length >= 5) { rest = median(recent); collecting = null }
      else { rest = null; collecting = [] }
      // T-319: same median / first-3-samples rule for the roll axis.
      const recentY = history.filter(h => h.t > tMs - windowMs && h.y !== undefined).map(h => h.y as number)
      if (recentY.length >= 5) { restY = median(recentY); collectingY = null }
      else { restY = null; collectingY = [] }
    },
    disarm() { armed = false; rest = null; restY = null; collecting = null; collectingY = null; reset() },
    sample(x, tMs, y) {
      history.push({ x, t: tMs, y })
      history = history.filter(h => h.t > tMs - windowMs)
      if (!armed) return null
      if (rest === null) {
        collecting?.push(x)
        if (y !== undefined) collectingY?.push(y)
        if (collecting && collecting.length >= 3) {
          rest = median(collecting)
          collecting = null
          if (collectingY && collectingY.length >= 3) { restY = median(collectingY); collectingY = null }
        }
        return null
      }
      // x's rest was set at arm but y's history was short: finish collecting restY
      // alongside normal x detection.
      if (restY === null && collectingY && y !== undefined) {
        collectingY.push(y)
        if (collectingY.length >= 3) { restY = median(collectingY); collectingY = null }
      }
      if (tMs - lastFire < cooldownMs) { run = null; return null }
      const dx = x - rest
      const hasY = restY !== null && y !== undefined
      const dy = hasY ? (y as number) - (restY as number) : 0
      if (locked) {
        const inX = Math.abs(dx) < deadZone
        const inY = !hasY || Math.abs(dy) < deadZone
        inside = inX && inY ? inside + 1 : 0
        if (inside >= rearmSamples) { locked = false; inside = 0 }
        return null
      }
      // T-319: roll wins. A clearly rolled head can't also count an x run; a full
      // roll held `holdSamples` fires SELECT.
      if (hasY && Math.abs(dy) >= rollWin) {
        if (Math.abs(dy) >= rollFire) {
          run = run?.dir === 'SELECT' ? { dir: 'SELECT', n: run.n + 1 } : { dir: 'SELECT', n: 1 }
          if (run.n >= holdSamples) {
            run = null
            locked = true
            inside = 0
            lastFire = tMs
            return 'SELECT'
          }
        } else run = null
        return null
      }
      const dir: TiltDir | null = dx <= -fire ? 'NEXT' : dx >= fire ? 'PREV' : null
      if (!dir) { run = null; return null }
      run = run?.dir === dir ? { dir, n: run.n + 1 } : { dir, n: 1 }
      if (run.n < holdSamples) return null
      run = null
      locked = true
      inside = 0
      lastFire = tMs
      return dir
    },
  }
}
