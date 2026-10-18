import { AudioInputSource, type EvenAppBridge } from '@evenrealities/even_hub_sdk'
import type { MicSource } from './mic'

// The only file in src/audio/ that imports the Even SDK.
//
// Glasses mic only (D7): lower noise floor than the phone mic, 50 ms chunks, and
// `audioControl(true, Phone)` was unreliable on the real G2 (S-3 §1). Requires
// `createStartUpPageContainer` to have succeeded first, and `g2-microphone` in app.json.

type AudioBridge = Pick<EvenAppBridge, 'audioControl' | 'onEvenHubEvent'>

export function createGlassesMic(bridge: AudioBridge): MicSource {
  const listeners = new Set<(pcm: Uint8Array) => void>()
  let unsubscribe: (() => void) | null = null

  return {
    async open() {
      if (!unsubscribe) {
        unsubscribe = bridge.onEvenHubEvent(event => {
          const audio = event.audioEvent
          if (!audio?.audioPcm?.byteLength) return
          if (audio.source && audio.source !== AudioInputSource.Glasses) return
          for (const cb of [...listeners]) cb(audio.audioPcm)
        })
      }
      let ok = false
      try { ok = await bridge.audioControl(true, AudioInputSource.Glasses) } catch { ok = false }
      if (!ok) { unsubscribe?.(); unsubscribe = null }
      return ok
    },
    async close() {
      unsubscribe?.()
      unsubscribe = null
      try { await bridge.audioControl(false) } catch { /* already closed */ }
    },
    onChunk(cb) {
      listeners.add(cb)
      return () => { listeners.delete(cb) }
    },
  }
}
