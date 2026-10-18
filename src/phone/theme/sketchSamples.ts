import type { Screen } from '../../core/types'

/** Representative screens for layout sketches and the token demo (not production copy). */
export const sketchScreens: Record<Screen['kind'], Screen> = {
  blank: { kind: 'blank' },
  prompt: {
    kind: 'prompt',
    sentence: 'You drink from a ____.',
  },
  cue: {
    kind: 'cue',
    level: 2,
    word: 'cup',
    masked: 'c_p',
    imageKey: 'cup',
    sentence: 'You drink from a ____.',
  },
  feedback: { kind: 'feedback', ok: true, word: 'cup' },
  candidates: {
    kind: 'candidates',
    level: 1,
    index: 0,
    items: [
      { word: 'water', confidence: 0.82, imageKey: 'water', source: 'bank' },
      { word: 'coffee', confidence: 0.61, imageKey: 'coffee', source: 'bank' },
      { word: 'tea', confidence: 0.44, source: 'bank' },
    ],
  },
  menu: {
    kind: 'menu',
    title: 'Practice',
    items: ['Step 1 — Say the word', 'Step 2 — Conversation help', 'Word bank'],
    index: 0,
  },
  status: {
    kind: 'status',
    text: 'Microphone is off. Open Settings on your phone to allow mic access.',
  },
}
