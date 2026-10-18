// Step 3, Ambient: Step 2 plus hints the user didn't ask for. When the stall
// detector (T-301) fires, Step 3 taps for the user: it sends Step 2 a virtual SELECT
// while the display is blank, so the hint, the cue ladder (tap escalates), swipes
// between candidates, "heard the word → clear" and the auto-dismiss are all Step 2's
// own behavior, not a copy of it. If the detector throws, no more virtual taps:
// the mode carries on as plain Step 2 (T-302 fallback).
//
// Pause (proposed gesture, ORCH to confirm): a swipe while the display is blank
// toggles auto-hints off/on, with a short status notice. Step 2 ignores swipes when
// idle, so this takes nothing away. Taps still ask for help as in Step 2.
//
// Key words (PLAN §12.1 default: shown after a stall): the Screen contract has no
// strip for them yet, so each auto-hint logs the T-303 key words for the companion
// log (T-304) until ORCH decides how they reach the glasses.
import type { GlassesUI, Intent, Mode, ModeContext, Screen, Transcript, Unsubscribe, WordEntry } from '../../core/types'
import { extractKeywords } from '../../ai/keywords'
import { attachStallDetector, createStallDetector, type StallConfig, type StallDetector, type StallSignal } from '../../ai/stall'
import { createStep2, type Step2Options } from '../step2'

export interface Step3Options {
  step2?: Step2Options
  stall?: Partial<StallConfig>
  /** Swap the detector (tests). */
  makeDetector?(config?: Partial<StallConfig>): StallDetector
  /** How long the "Auto-hints paused/on" notice stays up. */
  noticeMs?: number
  /** Detector tick period. */
  tickMs?: number
}

const MAX_TRANSCRIPTS = 40

export function createStep3(options: Step3Options = {}): Mode {
  const noticeMs = options.noticeMs ?? 1500
  const makeDetector = options.makeDetector ?? createStallDetector

  let ctx: ModeContext | null = null
  let inner: Mode | null = null
  let subs: Unsubscribe[] = []
  let detach: (() => void) | null = null
  let detector: StallDetector | null = null
  let step2Intent: ((i: Intent) => void) | null = null
  let bank: WordEntry[] = []
  let transcripts: Transcript[] = []
  let screen: Screen['kind'] = 'blank'
  let paused = false
  let degraded = false // detector failed: plain Step 2 from here on
  let autoPending = false // the next screen answers a virtual tap
  let noticeTimer: ReturnType<typeof setTimeout> | null = null
  let noticeToken = 0

  const clearNotice = () => { if (noticeTimer) clearTimeout(noticeTimer); noticeTimer = null }

  /** The glasses as Step 2 sees them: records what is on screen and keeps auto-hints quiet. */
  function proxyUi(real: GlassesUI): GlassesUI {
    return {
      show(s) {
        if (autoPending) {
          autoPending = false
          // An unrequested hint that found nothing stays blank: "No suggestion yet" is
          // useful after a tap, noise on a display nobody asked to wake.
          if (s.kind === 'status') { ctx?.log('step3 auto-hint empty'); s = { kind: 'blank' } }
        }
        if (s.kind !== 'status') { clearNotice(); noticeToken++ }
        screen = s.kind
        return real.show(s)
      },
      onIntent(cb) {
        step2Intent = cb
        return () => { if (step2Intent === cb) step2Intent = null }
      },
    }
  }

  function onIntent(i: Intent) {
    if (!ctx) return
    if (!ctx.flags.step3Enabled) { if (i === 'BACK') ctx.leave?.(); return }
    if (screen === 'blank' && (i === 'NEXT' || i === 'PREV') && !degraded) { void togglePause(); return }
    autoPending = false // a real gesture: Step 2's response is not an auto-hint
    step2Intent?.(i)
  }

  async function togglePause() {
    if (!ctx) return
    const c = ctx
    paused = !paused
    detector?.reset()
    c.log('step3 pause', { paused })
    clearNotice()
    const mine = ++noticeToken
    screen = 'status'
    await c.ui.show({ kind: 'status', text: paused ? 'Auto-hints paused.\nSwipe to turn back on.' : 'Auto-hints on.' })
    noticeTimer = setTimeout(() => {
      if (mine !== noticeToken || ctx !== c) return
      screen = 'blank'
      void c.ui.show({ kind: 'blank' })
    }, noticeMs)
  }

  function onStall(s: StallSignal) {
    if (!ctx) return
    const base = { silenceMs: s.silenceMs, reason: s.reason, stalledAfter: s.stalledAfter }
    if (paused || screen !== 'blank' || !step2Intent) {
      ctx.log('step3 auto-hint skipped', { ...base, why: paused ? 'paused' : screen !== 'blank' ? `showing ${screen}` : 'step2 not ready' })
      return
    }
    const keywords = extractKeywords(transcripts, bank, { n: 3, nowMs: s.tMs }).map(k => k.word)
    ctx.log('step3 auto-hint', { ...base, keywords })
    autoPending = true
    step2Intent('SELECT')
  }

  return {
    id: 'step3',
    title: 'Ambient',
    async enter(c) {
      ctx = c
      paused = false
      degraded = false
      autoPending = false
      transcripts = []
      screen = 'blank'
      subs = [c.ui.onIntent(onIntent)]
      if (!c.flags.step3Enabled) {
        screen = 'status'
        await c.ui.show({ kind: 'status', text: 'Step 3 is turned off.\nDouble-tap to go back.' })
        return
      }
      bank = await c.store.getBank()
      subs.push(c.stt.onTranscript(t => {
        if (t.isFinal && !t.error && t.text.trim()) transcripts = [...transcripts, t].slice(-MAX_TRANSCRIPTS)
      }))
      // Step 3 includes Step 2, whatever the Step 2 flag says.
      inner = createStep2(options.step2)
      await inner.enter({ ...c, ui: proxyUi(c.ui), flags: { ...c.flags, step2Enabled: true } })
      detector = makeDetector(options.stall)
      detach = attachStallDetector(c.stt, detector, onStall, {
        now: c.now,
        tickMs: options.tickMs,
        onError: err => {
          degraded = true
          c.log('step3 detector failed; continuing as Step 2', { error: String(err) })
        },
      })
    },
    async exit() {
      detach?.()
      detach = null
      detector?.reset()
      detector = null
      for (const off of subs) off()
      subs = []
      clearNotice()
      noticeToken++
      const i = inner
      inner = null
      step2Intent = null
      ctx = null
      await i?.exit()
    },
  }
}

export default createStep3()
