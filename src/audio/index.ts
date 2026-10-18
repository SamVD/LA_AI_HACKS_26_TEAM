import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { createGlassesMic } from './capture'
import { ElevenLabsStt, type ElevenLabsSttOptions } from './stt'
import { TokenProvider } from './token'

export { ElevenLabsStt } from './stt'
export type { ElevenLabsSttOptions } from './stt'
export { EnergyVad } from './vad'
export type { VadOptions } from './vad'
export type { MicSource } from './mic'
export { TokenProvider } from './token'
export { createGlassesMic } from './capture'

type Env = Record<string, unknown>
const defaultEnv = () => (import.meta as ImportMeta & { env?: Env }).env ?? {}

/**
 * Token minter URL. Set VITE_STT_TOKEN_URL at build/pack time to the hosted
 * `api/stt/token` (a packaged build cannot reach a laptop). Dev default: the
 * spike token server (`node spikes/stt/token-server.mjs`) on the same host.
 */
export function sttTokenUrl(env: Env = defaultEnv()): string {
  const v = env.VITE_STT_TOKEN_URL
  if (typeof v === 'string' && v) return v
  const host = typeof location === 'undefined' ? 'localhost' : location.hostname
  return `http://${host}:8787/token/batch_scribe`
}

/**
 * Real STT over the glasses mic. Call after `createStartUpPageContainer` succeeds
 * (the glasses mic depends on it). ORCH wires this into src/main.ts in place of MockStt.
 */
export function createElevenLabsStt(
  bridge: Pick<EvenAppBridge, 'audioControl' | 'onEvenHubEvent'>,
  o: Partial<Omit<ElevenLabsSttOptions, 'mic' | 'tokens'>> & { tokenUrl?: string } = {},
): ElevenLabsStt {
  const { tokenUrl, ...rest } = o
  return new ElevenLabsStt({
    ...rest,
    mic: createGlassesMic(bridge),
    tokens: new TokenProvider({ url: tokenUrl ?? sttTokenUrl(), type: 'batch_scribe', fetch: rest.fetch, now: rest.now }),
  })
}
