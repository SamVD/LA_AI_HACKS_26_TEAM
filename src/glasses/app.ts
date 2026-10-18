// Wires the glasses side together: renderer, touchpad, shell and lifecycle.
// main.ts supplies the real bridge and services; tests supply fakes.
import type { Flags, GlassesUI, ImageSource, Mode, ModeContext, ModeId, Store } from '../core/types'
import type { HubBridge, Log } from './bridge'
import { toIntent, toSystemSignal } from './input'
import { createLifecycle, type VisibilitySource } from './lifecycle'
import { createShell } from './shell'
import { createGlassesUI } from './ui'

export interface AppOptions {
  hub: HubBridge
  modes: Record<ModeId, Mode>
  flags: Flags
  store: Store
  images?: ImageSource
  makeContext(parts: { ui: GlassesUI; leave: () => void }): ModeContext
  log?: Log
  doc?: VisibilitySource
}

export async function startApp(opts: AppOptions) {
  const log = opts.log ?? (() => {})
  const ui = createGlassesUI(opts.hub, { images: opts.images, log })
  const shell = createShell({
    ui,
    modes: opts.modes,
    flags: opts.flags,
    store: opts.store,
    makeContext: opts.makeContext,
    exitApp: () => { void opts.hub.exitDialog() },
    log,
  })

  let unsubscribe = () => {}
  const lifecycle = createLifecycle({ shell, refresh: () => ui.refresh(), store: opts.store, log, unsubscribe: () => unsubscribe(), doc: opts.doc })
  unsubscribe = opts.hub.onEvent(event => {
    const intent = toIntent(event)
    if (intent) { ui.dispatch(intent); return }
    const signal = toSystemSignal(event)
    if (signal) void lifecycle.onSystem(signal)
  })

  await shell.showLauncher()
  return { shell, ui }
}
