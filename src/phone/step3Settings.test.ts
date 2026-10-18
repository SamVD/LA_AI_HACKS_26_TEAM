import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_STALL_CONFIG } from '../ai/stall'
import {
  readStep3Settings,
  stallOverrides,
  writeStep3Settings,
  onStep3SettingsChange,
} from './step3Settings'

const memoryStorage = () => {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    raw: map,
  } as unknown as Storage & { raw: Map<string, string> }
}

describe('step3Settings', () => {
  it('returns defaults when nothing is stored and on corrupt JSON', () => {
    const storage = memoryStorage()
    expect(readStep3Settings(storage)).toEqual({ sensitivity: 'balanced', paused: false })
    storage.raw.set('nudge.step3', '{oops')
    expect(readStep3Settings(storage)).toEqual({ sensitivity: 'balanced', paused: false })
  })

  it('round-trips a patch and ignores unknown sensitivities', () => {
    const storage = memoryStorage()
    expect(writeStep3Settings({ sensitivity: 'eager' }, storage)).toEqual({ sensitivity: 'eager', paused: false })
    expect(writeStep3Settings({ paused: true }, storage)).toEqual({ sensitivity: 'eager', paused: true })
    storage.raw.set('nudge.step3', JSON.stringify({ sensitivity: 'wild', paused: 1 }))
    expect(readStep3Settings(storage)).toEqual({ sensitivity: 'balanced', paused: false })
  })

  it('maps sensitivity to stall-threshold overrides', () => {
    expect(stallOverrides('balanced')).toEqual({})
    const calm = { ...DEFAULT_STALL_CONFIG, ...stallOverrides('calm') }
    const eager = { ...DEFAULT_STALL_CONFIG, ...stallOverrides('eager') }
    expect(calm.minSilenceMs).toBeGreaterThan(DEFAULT_STALL_CONFIG.minSilenceMs)
    expect(calm.maxPerMinute).toBeLessThan(DEFAULT_STALL_CONFIG.maxPerMinute)
    expect(eager.minSilenceMs).toBeLessThan(DEFAULT_STALL_CONFIG.minSilenceMs)
    expect(eager.contentWordEndings).toBe(false)
    expect(eager.cooldownMs).toBeLessThan(DEFAULT_STALL_CONFIG.cooldownMs)
  })

  it('notifies subscribers with the merged settings on write', () => {
    const storage = memoryStorage()
    const cb = vi.fn()
    const off = onStep3SettingsChange(cb)
    writeStep3Settings({ paused: true }, storage)
    expect(cb).toHaveBeenCalledOnce()
    expect(cb).toHaveBeenLastCalledWith({ sensitivity: 'balanced', paused: true })
    off()
    writeStep3Settings({ paused: false }, storage)
    expect(cb).toHaveBeenCalledOnce()
  })

  it('does not throw without a DOM (dispatchEvent is optional)', () => {
    const storage = memoryStorage()
    expect(() => writeStep3Settings({ sensitivity: 'calm' }, storage)).not.toThrow()
    expect(readStep3Settings(storage).sensitivity).toBe('calm')
  })
})
