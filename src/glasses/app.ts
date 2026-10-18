// Wires the glasses side together: renderer, touchpad, shell and lifecycle.
// main.ts supplies the real bridge and services; tests supply fakes.
import type { Flags, GlassesUI, ImageSource, Mode, ModeContext, ModeId, Store } from '../core/types'
import type { HubBridge, Log } from './bridge'
import { toIntent, toSystemSignal } from './input'
import { createTiltDetector } from './imu/tilt'
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
  /** Clock for IMU samples (they carry no timestamp). */
  now?: () => number
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
  // T-305: head tilt = swipe, but only while suggestions are on the glasses.
  // NEXT/PREV mean other things on the blank, menu and Practice screens.
  const now = opts.now ?? Date.now
  const tilt = opts.flags.imuEnabled ? createTiltDetector() : null
  // Arm only on the transition into `candidates`: re-arming on each redraw would re-take
  // `rest` from the tilted samples and fire again (NEXT, NEXT, PREV on a single look down).
  let lastKind: string | null = null
  tilt && shell.onScreen(screen => {
    if (screen.kind === 'candidates') { if (lastKind !== 'candidates') tilt.arm(now()) }
    else tilt.disarm()
    lastKind = screen.kind
  })

  unsubscribe = opts.hub.onEvent(event => {
    const intent = toIntent(event)
    if (intent) { ui.dispatch(intent); return }
    const imu = event.sysEvent?.imuData as { x?: number; y?: number } | undefined
    if (tilt && imu) {
      // T-319: y is the roll axis — a sideways tilt fires SELECT like a tap.
      const dir = tilt.sample(imu.x ?? 0, now(), imu.y ?? 0)
      if (dir && shell.lastScreen()?.kind === 'candidates') {
        log('imu.tilt', { dir, kind: 'candidates' })
        ui.dispatch(dir)
      }
      return
    }
    const signal = toSystemSignal(event)
    if (signal) void lifecycle.onSystem(signal)
  })

  await shell.showLauncher()
  if (tilt) log('imu.on', { ok: await opts.hub.imuControl(true) })
  return { shell, ui }
}
