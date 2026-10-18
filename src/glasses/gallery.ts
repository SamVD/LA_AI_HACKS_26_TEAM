// Dev check, enabled with `?gallery=1`: replaces Step 1 in the launcher with a
// mode that steps through one Screen of every kind (swipe down / up) and shows
// each touchpad Intent as it arrives. One packaged build then covers every
// layout on the real G2. Double-click goes back to the launcher.
import type { Mode, Screen, Suggestion } from '../core/types'

const items: Suggestion[] = [
  { word: 'cup', confidence: 0.82, source: 'bank', imageKey: 'cup', mouthKey: 'k' },
  { word: 'mug', confidence: 0.4, source: 'bank' },
  { word: 'glass', confidence: 0.2, source: 'model' },
]

export const GALLERY: Screen[] = [
  { kind: 'status', text: 'Screen gallery\nSwipe down: next screen\nSwipe up: previous\nTap: show the gesture\nDouble-tap: back to launcher' },
  { kind: 'prompt', sentence: 'You drink from a ____.' },
  { kind: 'prompt', sentence: 'We sit on a bench by the playground in the ____.' },
  { kind: 'cue', level: 1, word: 'cup', imageKey: 'cup', sentence: 'You drink from a ____.' },
  { kind: 'cue', level: 2, word: 'cup', masked: 'c_p' },
  { kind: 'cue', level: 3, word: 'cup' },
  { kind: 'feedback', ok: true, word: 'cup' },
  { kind: 'feedback', ok: false, word: 'cup' },
  { kind: 'candidates', items, index: 0, level: 1 },
  { kind: 'candidates', items, index: 0, level: 2 },
  { kind: 'candidates', items, index: 0, level: 3 },
  { kind: 'menu', title: 'Menu sample', items: ['Step 1  Practice', 'Step 2  Assist', 'Step 3  Ambient', 'Word bank'], index: 1 },
  { kind: 'blank' },
]

export function createGallery(): Mode {
  let index = 0
  let off = () => {}
  return {
    id: 'step1',
    title: 'Screen gallery',
    async enter(ctx) {
      index = 0
      const label = (s: Screen) => `${index + 1}/${GALLERY.length} ${s.kind}${'level' in s ? ` L${s.level}` : ''}`
      const show = () => {
        ctx.log('gallery', label(GALLERY[index]))
        return ctx.ui.show(GALLERY[index])
      }
      off = ctx.ui.onIntent(intent => {
        ctx.log('gallery intent', intent)
        if (intent === 'BACK') { ctx.leave?.(); return }
        if (intent === 'NEXT') index = (index + 1) % GALLERY.length
        if (intent === 'PREV') index = (index - 1 + GALLERY.length) % GALLERY.length
        if (intent === 'SELECT') { void ctx.ui.show({ kind: 'status', text: `Tap received (SELECT)\n${label(GALLERY[index])}\nSwipe to continue` }); return }
        void show()
      })
      await show()
    },
    async exit() { off() },
  }
}
