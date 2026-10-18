// Step 2, Assist: during a real conversation the display stays blank until the
// user taps for help. Suggestions are prefetched in the background on every
// final transcript segment (through the D11 throttle), so a tap shows them
// straight from the cache. SELECT climbs the cue ladder (mouth shape or
// picture → first letter → word), swipes move between the top 3, BACK hides.
import type { Intent, Mode, ModeContext, Suggestion, Transcript, Unsubscribe, WordEntry } from '../../core/types'
import { CueLadder } from '../../glasses/ladder'
import { matchWord } from '../../matching'
import { buildRequest, withAssets } from './request'
import { createThrottledPredictor, type ThrottledPredictor } from '../../ai/predictor'

export interface Step2Options {
  /** Hide the suggestions after this long without a touchpad gesture. */
  dismissMs?: number
  /** Swap in T-201's throttle, or a fake in tests. */
  makeThrottle?(ctx: ModeContext): ThrottledPredictor
}

const MAX_FINALS = 20
const MAX_ITEMS = 3
/** T-208: a help tap waits at most this long for the segment being spoken to be transcribed. */
const FLUSH_CAP_MS = 1200
/** ...and skips the flush when a final arrived this recently (nothing new to wait for). */
const FRESH_FINAL_MS = 300

type Phase = 'idle' | 'loading' | 'help' | 'empty' | 'off'

export function createStep2(options: Step2Options = {}): Mode {
  const dismissMs = options.dismissMs ?? 20_000
  const makeThrottle = options.makeThrottle ?? (ctx => createThrottledPredictor(ctx.predictor, { now: ctx.now }))

  let ctx: ModeContext | null = null
  let subs: Unsubscribe[] = []
  let throttle: ThrottledPredictor | null = null
  let bank: WordEntry[] = []
  let finals: string[] = []
  let lastFinalAt: number | null = null
  let phase: Phase = 'idle'
  let items: Suggestion[] = []
  let index = 0
  let shownAt = 0
  let generation = 0
  let dismissTimer: ReturnType<typeof setTimeout> | null = null
  const ladder = new CueLadder()

  const show = (s: Parameters<ModeContext['ui']['show']>[0]) => ctx?.ui.show(s) ?? Promise.resolve()

  function armDismiss() {
    if (dismissTimer) clearTimeout(dismissTimer)
    dismissTimer = setTimeout(() => { void toIdle('timeout') }, dismissMs)
  }

  async function toIdle(reason: string) {
    if (dismissTimer) clearTimeout(dismissTimer)
    dismissTimer = null
    generation++
    if (phase !== 'idle') ctx?.log('step2 hide', { reason })
    phase = 'idle'
    items = []
    await show({ kind: 'blank' })
  }

  function render() {
    armDismiss()
    return show(ladder.candidates(items, index))
  }

  async function help() {
    if (!ctx || !throttle) return
    const c = ctx
    const mine = ++generation
    const tapAt = c.now()
    phase = 'loading'
    // T-208: with batch STT (D17) the newest words are only transcribed after a pause, so
    // end the segment now and let its final land in `finals` before building the request.
    if (c.stt.flush && (lastFinalAt === null || tapAt - lastFinalAt >= FRESH_FINAL_MS)) {
      let cap: ReturnType<typeof setTimeout> | undefined
      await Promise.race([c.stt.flush(), new Promise<void>(resolve => { cap = setTimeout(resolve, FLUSH_CAP_MS) })])
      clearTimeout(cap)
      if (mine !== generation || ctx !== c) return
      c.log('step2 flush', { ms: c.now() - tapAt })
    }
    const found = await throttle.onHelp(buildRequest(finals, bank))
    if (mine !== generation || ctx !== c) return
    const ms = c.now() - tapAt
    if (!found.length) {
      phase = 'empty'
      c.log('step2 help', { ms, count: 0 })
      armDismiss()
      await show({ kind: 'status', text: 'No suggestion yet' })
      return
    }
    items = withAssets(found.slice(0, MAX_ITEMS), bank)
    index = 0
    ladder.reset()
    phase = 'help'
    shownAt = c.now()
    c.log('step2 help', { ms, count: items.length, words: items.map(i => i.word) })
    await render()
  }

  function onIntent(intent: Intent) {
    if (!ctx) return
    if (phase === 'off') { if (intent === 'BACK') ctx.leave?.(); return }
    if (intent === 'BACK') {
      if (phase === 'idle') ctx.leave?.()
      else void toIdle('back')
      return
    }
    if (phase === 'idle' || phase === 'empty') {
      if (intent === 'SELECT') void help()
      return
    }
    if (phase !== 'help') return
    if (intent === 'SELECT') {
      ladder.escalate()
      ctx.log('step2 cue', { word: items[index].word, level: ladder.level })
    } else {
      index = (index + (intent === 'NEXT' ? 1 : items.length - 1)) % items.length
      ladder.reset()
    }
    void render()
  }

  function onTranscript(t: Transcript) {
    if (!ctx || t.error) return
    // The user found the word: clear the display. Only speech after the suggestions
    // appeared counts, and candidates are never STT keyterms (D2), so this is not
    // the recogniser echoing what we showed.
    if (phase === 'help' && t.tEndMs >= shownAt) {
      const heard = items.find(item => matchWord(t.text, item.word, 1).ok)
      if (heard) {
        ctx.log('step2 heard', { word: heard.word, level: ladder.level })
        void toIdle('heard')
      }
    }
    if (t.isFinal && t.text.trim()) {
      finals = [...finals, t.text.trim()].slice(-MAX_FINALS)
      lastFinalAt = ctx.now()
      throttle?.onFinal(buildRequest(finals, bank))
    }
  }

  return {
    id: 'step2',
    title: 'Assist',
    async enter(c) {
      ctx = c
      finals = []
      lastFinalAt = null
      items = []
      phase = 'idle'
      subs = [c.ui.onIntent(onIntent)]
      if (!c.flags.step2Enabled) {
        phase = 'off'
        await show({ kind: 'status', text: 'Step 2 is turned off.\nDouble-tap to go back.' })
        return
      }
      bank = await c.store.getBank()
      throttle = makeThrottle(c)
      subs.push(c.stt.onTranscript(onTranscript))
      await show({ kind: 'blank' })
      try {
        await c.stt.start()
      } catch (err) {
        c.log('step2 stt start failed', { error: String(err) })
      }
    },
    async exit() {
      for (const off of subs) off()
      subs = []
      if (dismissTimer) clearTimeout(dismissTimer)
      dismissTimer = null
      throttle?.stop()
      throttle = null
      generation++
      const c = ctx
      ctx = null
      await c?.stt.stop()
    },
  }
}

export default createStep2()
