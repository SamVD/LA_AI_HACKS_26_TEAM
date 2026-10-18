import type { Mode, ModeId } from '../core/types'
import { createStallDetector, type StallConfig, type StallDetector } from '../ai/stall'
import { readStep3Settings, stallOverrides, type Step3Settings } from '../phone/step3Settings'
import step1 from './step1'
import step2 from './step2'
import { createStep3 } from './step3'

/**
 * T-304 → T-302: the companion's Step 3 card drives the stall detector. Sensitivity is
 * read when the mode starts (each detector is built on enter); pause is read whenever
 * the detector would fire, so it takes effect immediately. The swipe pause on the
 * glasses (T-302) still works on its own.
 */
export function settingsDetector(
  config: Partial<StallConfig> = {},
  read: () => Step3Settings = readStep3Settings,
): StallDetector {
  const detector = createStallDetector({ ...config, ...stallOverrides(read().sensitivity) })
  return {
    onEvent(e) {
      const signal = detector.onEvent(e)
      return signal && read().paused ? null : signal
    },
    nextCheckMs: () => detector.nextCheckMs(),
    reset: () => detector.reset(),
  }
}

const step3 = createStep3({ makeDetector: config => settingsDetector(config) })

export const modes: Record<ModeId, Mode> = { step1, step2, step3 }

export function getMode(id: ModeId): Mode {
  return modes[id]
}
