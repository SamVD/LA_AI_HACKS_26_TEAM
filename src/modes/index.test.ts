import { describe, expect, it } from 'vitest'
import type { Step3Settings } from '../phone/step3Settings'
import { settingsDetector } from './index'

// A stall: speech, then silence after a function word, long enough for the default config.
function runStall(detector: ReturnType<typeof settingsDetector>, silenceMs: number) {
  detector.onEvent({ type: 'speech', speaking: true, tMs: 0 })
  detector.onEvent({ type: 'transcript', text: 'could you pour my tea into the', isFinal: true, tMs: 900 })
  detector.onEvent({ type: 'speech', speaking: false, tMs: 1000 })
  return detector.onEvent({ type: 'tick', tMs: 1000 + silenceMs })
}

describe('settingsDetector (companion Step 3 settings → stall detector)', () => {
  const settings = (s: Partial<Step3Settings>) => () => ({ sensitivity: 'balanced' as const, paused: false, ...s })

  it('fires with the default (balanced) settings', () => {
    expect(runStall(settingsDetector({}, settings({})), 1600)).toMatchObject({ reason: 'function-word' })
  })

  it('suppresses hints while paused, and reads pause live', () => {
    let paused = true
    const read = () => ({ sensitivity: 'balanced' as const, paused })
    const d = settingsDetector({}, read)
    expect(runStall(d, 1600)).toBeNull()
    paused = false
    expect(runStall(d, 1600 + 20_000)).not.toBeNull() // a new silence, past the cooldown
  })

  it('applies the sensitivity preset (calm waits longer)', () => {
    expect(runStall(settingsDetector({}, settings({ sensitivity: 'calm' })), 1600)).toBeNull()
    expect(runStall(settingsDetector({}, settings({ sensitivity: 'calm' })), 2600)).not.toBeNull()
  })
})
