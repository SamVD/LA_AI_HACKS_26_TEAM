import type { GlassesUI, ImageSource, Intent, Screen, Unsubscribe } from '../core/types'
import type { HubBridge, Log } from './bridge'
import { layoutScreen, pageSignature, type PageSpec } from './layout'

export interface RenderingUI extends GlassesUI {
  /** Delivers an Intent (from the touchpad mapper) to every subscriber. */
  dispatch(intent: Intent): void
  /** Redraws the last Screen from scratch (after the phone comes back, for example). */
  refresh(): Promise<void>
  lastScreen(): Screen | null
}

export interface GlassesUIOptions {
  images?: ImageSource
  log?: Log
}

/**
 * GlassesUI over the SDK. Text first: show() resolves once the text is on the
 * glasses; pictures follow, and a picture for a Screen that has since been
 * replaced is dropped instead of drawn over the new one.
 */
export function createGlassesUI(hub: HubBridge, opts: GlassesUIOptions = {}): RenderingUI {
  const log = opts.log ?? (() => {})
  const subscribers = new Set<(i: Intent) => void>()
  let page: PageSpec | null = null
  let started = false
  let generation = 0
  let last: Screen | null = null
  let chain: Promise<unknown> = Promise.resolve()

  async function render(screen: Screen, force: boolean): Promise<void> {
    const next = layoutScreen(screen, { images: Boolean(opts.images) })
    const gen = ++generation
    if (!started) {
      started = await hub.createPage(next)
      if (!started) log('startup page failed', { kind: screen.kind })
    } else if (!force && page && pageSignature(page) === pageSignature(next)) {
      for (const t of next.texts) {
        const before = page.texts.find(p => p.id === t.id)
        if (before?.content !== t.content) await hub.upgradeText(t.id, t.name, t.content)
      }
    } else if (!await hub.rebuildPage(next)) {
      log('rebuild failed', { kind: screen.kind })
    }
    const imagesChanged = force || !page || pageSignature(page) !== pageSignature(next)
    page = next
    if (imagesChanged && opts.images && next.images.length) void sendImages(next, gen, opts.images)
  }

  async function sendImages(spec: PageSpec, gen: number, images: ImageSource) {
    for (const img of spec.images) {
      const data = await images(img.imageKey, img.w, img.h).catch(err => { log('image load failed', { key: img.imageKey, error: String(err) }); return null })
      if (gen !== generation) { log('stale image skipped', { key: img.imageKey }); return }
      if (!data) continue
      if (data.width !== img.w || data.height !== img.h) { log('image size mismatch', { key: img.imageKey, w: data.width, h: data.height }); continue }
      await hub.sendImage(img.id, img.name, data.png)
    }
  }

  function enqueue(screen: Screen, force: boolean): Promise<void> {
    const next = chain.then(() => render(screen, force))
    chain = next.catch(err => log('render failed', { error: String(err) }))
    return next
  }

  return {
    show(screen) {
      last = screen
      return enqueue(screen, false)
    },
    onIntent(cb): Unsubscribe {
      subscribers.add(cb)
      return () => { subscribers.delete(cb) }
    },
    dispatch(intent) {
      for (const cb of [...subscribers]) cb(intent)
    },
    refresh() {
      return last ? enqueue(last, true) : Promise.resolve()
    },
    lastScreen: () => last,
  }
}
