import type { StallConfig } from '../ai/stall'

// T-304: companion-side Step 3 settings. The card only owns src/phone/**, so the
// values persist in the WebView's localStorage — the same JS context the modes run
// in — and a `nudge:step3-settings` event lets a running mode react (T-302 reads
// `stallOverrides(readStep3Settings().sensitivity)` and checks `paused` before
// showing a hint).

export type Step3Sensitivity = 'calm' | 'balanced' | 'eager'

export interface Step3Settings {
  sensitivity: Step3Sensitivity
  /** Ambient hints paused; a running Step 3 mode should stop showing new hints. */
  paused: boolean
}

export const STEP3_SETTINGS_EVENT = 'nudge:step3-settings'

const KEY = 'nudge.step3'
const DEFAULTS: Step3Settings = { sensitivity: 'balanced', paused: false }
const SENSITIVITIES: Step3Sensitivity[] = ['calm', 'balanced', 'eager']

const storageFor = (storage?: Storage | null) =>
  storage === undefined ? (typeof localStorage === 'undefined' ? null : localStorage) : storage

export function readStep3Settings(storage?: Storage | null): Step3Settings {
  const raw = storageFor(storage)?.getItem(KEY)
  if (!raw) return { ...DEFAULTS }
  try {
    const value = JSON.parse(raw) as Partial<Step3Settings>
    return {
      sensitivity: SENSITIVITIES.includes(value.sensitivity as Step3Sensitivity)
        ? (value.sensitivity as Step3Sensitivity)
        : DEFAULTS.sensitivity,
      paused: value.paused === true,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

const listeners = new Set<(settings: Step3Settings) => void>()

export function writeStep3Settings(
  patch: Partial<Step3Settings>,
  storage?: Storage | null,
): Step3Settings {
  const next = { ...readStep3Settings(storage), ...patch }
  storageFor(storage)?.setItem(KEY, JSON.stringify(next))
  for (const cb of listeners) cb({ ...next })
  if (typeof dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    dispatchEvent(new CustomEvent(STEP3_SETTINGS_EVENT, { detail: { ...next } }))
  }
  return next
}

/** Subscribe to settings changes (live pause/resume + sensitivity for a running mode). */
export function onStep3SettingsChange(cb: (settings: Step3Settings) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/**
 * Sensitivity → stall-detector overrides (T-301's StallConfig).
 * `balanced` is the tuned default from G1; `calm` needs a longer silence and hints
 * less often; `eager` uses a shorter silence and a higher per-minute cap only (no
 * content-word endings — that path caused false hints in G2 soak).
 */
export function stallOverrides(sensitivity: Step3Sensitivity): Partial<StallConfig> {
  switch (sensitivity) {
    case 'calm':
      return { minSilenceMs: 2500, cooldownMs: 20_000, maxPerMinute: 2, contentWordEndings: false }
    case 'eager':
      return { minSilenceMs: 900, cooldownMs: 5000, maxPerMinute: 6, contentWordEndings: false }
    case 'balanced':
      return {}
  }
}
