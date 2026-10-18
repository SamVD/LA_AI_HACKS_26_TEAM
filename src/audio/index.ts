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
 * Token minter URL. Packaged builds get the hosted `api/stt/token` from
 * VITE_STT_TOKEN_URL in `.env.production`. Dev default: the spike token server
 * (`node spikes/stt/token-server.mjs`, port 8787) on the same host, or set
 * VITE_STT_TOKEN_URL to the hosted minter, which allows http://localhost:5173.
 */
export function sttTokenUrl(env: Env = defaultEnv()): string {
  const v = env.VITE_STT_TOKEN_URL
  if (typeof v === 'string' && v) return v
  const host = typeof location === 'undefined' ? 'localhost' : location.hostname
  return `http://${host}:8787/token/batch_scribe`
}

/**
 * Step-1-only STT over the glasses mic (no rolling transcript). The app itself uses
 * `createRollingStt` from ./rolling (T-202), which builds on ElevenLabsStt; this factory
 * serves harnesses such as spikes/stt/t104-sim. Call after `createStartUpPageContainer`
 * succeeds (the glasses mic depends on it).
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
