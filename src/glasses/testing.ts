// Test helper: an in-memory HubBridge that records every call. Not used at runtime.
import type { HubBridge } from './bridge'
import type { HubEventLike } from './input'
import type { PageSpec } from './layout'

export type HubCall =
  | { op: 'create' | 'rebuild'; page: PageSpec }
  | { op: 'upgrade'; id: number; name: string; content: string }
  | { op: 'image'; id: number; name: string; bytes: number }
  | { op: 'exit' }
  | { op: 'imu'; on: boolean }

export function createFakeHub() {
  const calls: HubCall[] = []
  const listeners = new Set<(e: HubEventLike) => void>()
  const kv = new Map<string, string>()
  const hub: HubBridge = {
    async createPage(page) { calls.push({ op: 'create', page }); return true },
    async rebuildPage(page) { calls.push({ op: 'rebuild', page }); return true },
    async upgradeText(id, name, content) { calls.push({ op: 'upgrade', id, name, content }); return true },
    async sendImage(id, name, png) { calls.push({ op: 'image', id, name, bytes: png.byteLength }); return true },
    async exitDialog() { calls.push({ op: 'exit' }) },
    async imuControl(on) { calls.push({ op: 'imu', on }); return true },
    onEvent(cb) {
      const listener = cb as (e: HubEventLike) => void
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    async getItem(key) { return kv.get(key) ?? '' },
    async setItem(key, value) { kv.set(key, value); return true },
  }
  return {
    hub,
    calls,
    kv,
    listenerCount: () => listeners.size,
    fire(event: HubEventLike) { for (const l of [...listeners]) l(event) },
    /** Text of every container on the page after the last create/rebuild/upgrade. */
    texts(): string[] {
      let page: PageSpec | null = null
      const contents = new Map<number, string>()
      for (const c of calls) {
        if (c.op === 'create' || c.op === 'rebuild') { page = c.page; contents.clear(); for (const t of page.texts) contents.set(t.id, t.content) }
        if (c.op === 'upgrade') contents.set(c.id, c.content)
      }
      return page ? page.texts.map(t => contents.get(t.id) ?? '') : []
    },
  }
}

export const flush = () => new Promise(resolve => setTimeout(resolve, 0))
