import type { Flags, ModeId } from './core/types'

type Env = Record<string, unknown>
const defaultSearch = () => typeof location === 'undefined' ? '' : location.search
const defaultEnv = () => (import.meta as ImportMeta & { env?: Env }).env ?? {}

export function readFlags(search = defaultSearch(), env: Env = defaultEnv()): Flags {
  const params = new URLSearchParams(search)
  const value = (key: string, envKey: string) => params.has(key) ? params.get(key) : env[envKey]
  return {
    mockServices: value('svc', 'VITE_SVC') === 'mock',
    step2Enabled: value('step2', 'VITE_STEP2') === '1',
    step3Enabled: value('step3', 'VITE_STEP3') === '1',
    imuEnabled: value('imu', 'VITE_IMU') === '1',
  }
}

export function readInitialMode(search = defaultSearch(), env: Env = defaultEnv()): ModeId {
  const params = new URLSearchParams(search)
  const mode = params.has('mode') ? params.get('mode') : env.VITE_MODE
  return mode === 'step2' || mode === 'step3' ? mode : 'step1'
}
