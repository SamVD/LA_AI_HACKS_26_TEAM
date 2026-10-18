import type {
  AppShell,
  ModeId,
  PredictorService,
  Screen,
  Suggestion,
  Transcript,
  Unsubscribe,
} from '../../core/types'
import { readFlags } from '../../config'
import { builtinBank } from '../../content'
import { getMode, modes as modeRegistry } from '../../modes'
import { createMockContext, MockPredictor, MockStt } from '../../mocks'
import type { ModeContext } from '../../core/types'
import { createStore, memoryKeyValue } from '../../store'
import type { CompanionDebugSource, CompanionDebugState } from '../mountCompanion'
import { PreviewUI } from './previewUi'

export type DevShell = {
  shell: AppShell
  previewUi: PreviewUI
  debug: CompanionDebugSource
}

export function createDevShell(): DevShell {
  const store = createStore(memoryKeyValue(), builtinBank())
  let active: ModeId | null = null
  let context: ModeContext | null = null
  let last: Screen | null = null
  const listeners = new Set<(screen: Screen) => void>()

  let transcripts: Transcript[] = []
  let suggestions: Suggestion[] = []
  const debugListeners = new Set<(state: CompanionDebugState) => void>()
  let unsubTranscript: Unsubscribe | null = null

  const debugState = (): CompanionDebugState => ({ transcripts, suggestions })

  const notifyDebug = () => {
    for (const cb of [...debugListeners]) cb(debugState())
  }

  const notify = (screen: Screen) => {
    last = screen
    for (const cb of [...listeners]) cb(screen)
  }

  const ui = new PreviewUI(notify)
  const innerPredictor = new MockPredictor()
  const predictor: PredictorService = {
    async predict(request, signal) {
      suggestions = await innerPredictor.predict(request, signal)
      notifyDebug()
      return suggestions
    },
  }

  const leaveMode = async () => {
    if (!active || !context) return
    unsubTranscript?.()
    unsubTranscript = null
    await getMode(active).exit()
    await context.stt.stop()
    active = null
    context = null
  }

  const startMode = async (id: ModeId) => {
    await leaveMode()
    const flags = readFlags()
    const stt = new MockStt()
    context = createMockContext({
      ui,
      store,
      stt,
      predictor,
      flags: { ...flags, mockServices: true },
      leave: () => {
        void leaveMode()
      },
    })
    unsubTranscript = context.stt.onTranscript(t => {
      transcripts = [...transcripts, t].slice(-40)
      notifyDebug()
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

  const debug: CompanionDebugSource = {
    subscribe(cb) {
      debugListeners.add(cb)
      cb(debugState())
      return () => debugListeners.delete(cb)
    },
  }

  return { shell, previewUi: ui, debug }
}
