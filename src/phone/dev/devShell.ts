import type { AppShell, ModeId, Screen, Unsubscribe, WordEntry } from '../../core/types'
import { readFlags } from '../../config'
import { getMode, modes as modeRegistry } from '../../modes'
import { createMockContext, MemoryStore } from '../../mocks'
import type { ModeContext } from '../../core/types'
import { PreviewUI } from './previewUi'

export function createDevShell(seedBank: WordEntry[]): AppShell {
  const store = new MemoryStore(seedBank)
  let active: ModeId | null = null
  let context: ModeContext | null = null
  let last: Screen | null = null
  const listeners = new Set<(screen: Screen) => void>()

  const notify = (screen: Screen) => {
    last = screen
    for (const cb of [...listeners]) cb(screen)
  }

  const ui = new PreviewUI(notify)

  const leaveMode = async () => {
    if (!active || !context) return
    await getMode(active).exit()
    await context.stt.stop()
    active = null
    context = null
  }

  const startMode = async (id: ModeId) => {
    await leaveMode()
    const flags = readFlags()
    context = createMockContext({
      ui,
      store,
      flags: { ...flags, mockServices: true },
      leave: () => {
        void leaveMode()
      },
    })
    active = id
    await getMode(id).enter(context)
  }

  const shell: AppShell = {
    modes() {
      const flags = readFlags()
      return (['step1', 'step2', 'step3'] as ModeId[]).map(id => ({
        id,
        title: modeRegistry[id].title,
        enabled: id === 'step1' || (id === 'step2' ? flags.step2Enabled : flags.step3Enabled),
      }))
    },
    startMode,
    leaveMode,
    activeMode: () => active,
    onScreen(cb: (s: Screen) => void): Unsubscribe {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    lastScreen: () => last,
    store,
  }

  return shell
}
