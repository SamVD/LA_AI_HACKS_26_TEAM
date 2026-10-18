// Head tilt -> NEXT / PREV. Pure: feed it IMU x samples (g) and timestamps.
// Numbers come from the S-3 device spike: straight ahead x ≈ 0.03, look up
// ≈ +0.30, look down ≈ −0.25, about 10 samples/s.
export type TiltDir = 'NEXT' | 'PREV'

export interface TiltOptions {
  /** Distance from rest (g) that counts as a tilt. */
  fire?: number
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
  sample(x: number, tMs: number): TiltDir | null
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
  const holdSamples = opts.holdSamples ?? 4
  const deadZone = opts.deadZone ?? 0.1
  const rearmSamples = opts.rearmSamples ?? 2
  const cooldownMs = opts.cooldownMs ?? 700
  const windowMs = opts.windowMs ?? 2000

  let history: { x: number; t: number }[] = []
  let armed = false
  let rest: number | null = null
  let collecting: number[] | null = null
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
    },
    disarm() { armed = false; rest = null; collecting = null; reset() },
    sample(x, tMs) {
      history.push({ x, t: tMs })
      history = history.filter(h => h.t > tMs - windowMs)
      if (!armed) return null
      if (rest === null) {
        collecting?.push(x)
        if (collecting && collecting.length >= 3) { rest = median(collecting); collecting = null }
        return null
      }
      if (tMs - lastFire < cooldownMs) { run = null; return null }
      const dx = x - rest
      if (locked) {
        inside = Math.abs(dx) < deadZone ? inside + 1 : 0
        if (inside >= rearmSamples) { locked = false; inside = 0 }
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
