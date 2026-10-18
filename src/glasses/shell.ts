import type {
  AppShell, Flags, GlassesUI, Intent, Mode, ModeContext, ModeId, ModeInfo, Screen, Store, Unsubscribe,
} from '../core/types'

export interface ShellOptions {
  /** The real glasses UI. The shell owns its intents and hands modes a filtered copy. */
  ui: GlassesUI
  modes: Record<ModeId, Mode>
  flags: Flags
  store: Store
  /** Builds a ModeContext around the mode's own ui and leave(). */
  makeContext(parts: { ui: GlassesUI; leave: () => void }): ModeContext
  /** Root-page BACK: open the system exit dialog. */
  exitApp(): void
  log?(event: string, data?: unknown): void
}

const ORDER: ModeId[] = ['step1', 'step2', 'step3']
const LABEL: Record<ModeId, string> = { step1: 'Step 1', step2: 'Step 2', step3: 'Step 3' }

export function createShell(opts: ShellOptions): AppShell & { showLauncher(): Promise<void> } {
  const log = opts.log ?? (() => {})
  const screenListeners = new Set<(s: Screen) => void>()
  let last: Screen | null = null
  let launcherIndex = 0

  // The active mode, its context and the intent subscribers it registered.
  // `session` changes on every start/leave, so late calls from an old mode are dropped.
  let active: { id: ModeId; mode: Mode; ctx: ModeContext; subscribers: Set<(i: Intent) => void> } | null = null
  let session = 0

  function emit(screen: Screen): Promise<void> {
    last = screen
    for (const cb of [...screenListeners]) cb(screen)
    return opts.ui.show(screen)
  }

  function modeInfos(): ModeInfo[] {
    return ORDER.map(id => ({
      id,
      title: opts.modes[id].title,
      enabled: id === 'step1' || (id === 'step2' ? opts.flags.step2Enabled : opts.flags.step3Enabled),
    }))
  }

  const enabledModes = () => modeInfos().filter(m => m.enabled)

  function launcherScreen(): Screen {
    const items = enabledModes().map(m => `${LABEL[m.id]}  ${m.title}`)
    launcherIndex = Math.min(launcherIndex, Math.max(0, items.length - 1))
    return { kind: 'menu', title: 'Nudge', items, index: launcherIndex }
  }

  const showLauncher = () => emit(launcherScreen())

  async function leaveMode(): Promise<void> {
    if (!active) return
    const { id, mode, ctx } = active
    active = null
    session++
    try {
      await mode.exit()
      await ctx.stt.stop()
    } catch (err) {
      log('mode exit failed', { id, error: String(err) })
    }
    log('mode left', { id })
    await showLauncher()
  }

  async function startMode(id: ModeId): Promise<void> {
    await leaveMode()
    const info = modeInfos().find(m => m.id === id)
    if (!info?.enabled) { log('mode disabled', { id }); return }
    const mine = ++session
    const subscribers = new Set<(i: Intent) => void>()
    const ui: GlassesUI = {
      show: screen => (mine === session ? emit(screen) : Promise.resolve()),
      onIntent(cb): Unsubscribe {
        subscribers.add(cb)
        return () => { subscribers.delete(cb) }
      },
    }
    const ctx = opts.makeContext({ ui, leave: () => { if (mine === session) void leaveMode() } })
    const mode = opts.modes[id]
    active = { id, mode, ctx, subscribers }
    log('mode start', { id })
    try {
      await mode.enter(ctx)
    } catch (err) {
      log('mode enter failed', { id, error: String(err) })
      await leaveMode()
    }
  }

  opts.ui.onIntent(intent => {
    if (active) {
      // A mode that listens handles BACK itself and calls leave() at its top
      // level. One that never subscribed (the Phase 0 stubs) would trap the
      // user, so BACK leaves it.
      if (active.subscribers.size === 0) {
        if (intent === 'BACK') void leaveMode()
        return
      }
      for (const cb of [...active.subscribers]) cb(intent)
      return
    }
    const count = enabledModes().length
    if (intent === 'BACK') { opts.exitApp(); return }
    if (intent === 'NEXT' && count) { launcherIndex = (launcherIndex + 1) % count; void showLauncher() }
    if (intent === 'PREV' && count) { launcherIndex = (launcherIndex - 1 + count) % count; void showLauncher() }
    if (intent === 'SELECT' && count) void startMode(enabledModes()[launcherIndex].id)
  })

  return {
    modes: modeInfos,
    startMode,
    leaveMode,
    activeMode: () => active?.id ?? null,
    onScreen(cb): Unsubscribe {
      screenListeners.add(cb)
      return () => { screenListeners.delete(cb) }
    },
    lastScreen: () => last,
    store: opts.store,
    showLauncher,
  }
}
