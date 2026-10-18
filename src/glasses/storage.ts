import type { KeyValueStore } from '../core/types'
import type { HubBridge } from './bridge'

/** KeyValueStore over the SDK's get/setLocalStorage (the only storage that survives app restarts). */
export function createBridgeKeyValue(hub: Pick<HubBridge, 'getItem' | 'setItem'>): KeyValueStore {
  return {
    // getLocalStorage returns '' for a missing key.
    async get(key) {
      const value = await hub.getItem(key)
      return value === '' ? null : value
    },
    async set(key, value) {
      const ok = await hub.setItem(key, value)
      if (!ok) throw new Error(`setLocalStorage failed for ${key}`)
    },
  }
}
