// Phone lock / background and app exit, per S-3 (spikes/device/FINDINGS.md §5,
// decision D8). On the real G2 the WebView keeps running while the phone is
// locked: no reload, timers fire, the glasses mic keeps streaming. The SDK's
// FOREGROUND_* events never fired and SDK 0.0.12 has no setBackgroundState, so
// document.visibilitychange is the signal; SDK foreground events are handled
// the same way if they ever arrive.
import type { AppShell, Store } from '../core/types'
import type { Log } from './bridge'
import type { SystemSignal } from './input'

/** The slice of `document` the lifecycle needs; tests pass a fake. */
export interface VisibilitySource {
  visibilityState: DocumentVisibilityState
  addEventListener(type: 'visibilitychange', listener: () => void): void
  removeEventListener(type: 'visibilitychange', listener: () => void): void
}

export interface LifecycleOptions {
  shell: Pick<AppShell, 'leaveMode'>
  /** Redraws the current Screen. */
  refresh(): Promise<void>
  store: Store
  log: Log
  /** Stops listening to the hub; called once on exit. */
  unsubscribe(): void
  doc?: VisibilitySource
}

const flush = async (store: Store, log: Log) => {
  const flushable = store as Store & { flush?: () => Promise<void> }
  if (typeof flushable.flush !== 'function') return
  try { await flushable.flush() } catch (err) { log('store flush failed', { error: String(err) }) }
}

export function createLifecycle(opts: LifecycleOptions) {
  const doc = opts.doc ?? (typeof document === 'undefined' ? undefined : document)
  let exited = false

  async function hidden() {
    opts.log('lifecycle hidden')
    await flush(opts.store, opts.log)
  }

  async function visible() {
    opts.log('lifecycle visible')
    // Cheap insurance: the display should still be right, but redraw in case the host cleared it.
    await opts.refresh()
  }

  const onVisibility = () => { void (doc?.visibilityState === 'hidden' ? hidden() : visible()) }
  doc?.addEventListener('visibilitychange', onVisibility)

  return {
    async onSystem(signal: SystemSignal) {
      if (signal === 'foreground-exit') return hidden()
      if (signal === 'foreground-enter') return visible()
      // SYSTEM_EXIT / ABNORMAL_EXIT: the app is really closing (the user confirmed the
      // dialog). Nothing is cleaned up before that, because the user may cancel.
      if (exited) return
      exited = true
      opts.log('lifecycle exit')
      await opts.shell.leaveMode()
      await flush(opts.store, opts.log)
      doc?.removeEventListener('visibilitychange', onVisibility)
      opts.unsubscribe()
    },
  }
}
