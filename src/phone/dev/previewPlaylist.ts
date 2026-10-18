import type { Screen } from '../../core/types'
import { sketchScreens } from '../theme/sketchSamples'

const cueL1: Screen = {
  kind: 'cue',
  level: 1,
  word: 'cup',
  imageKey: 'cup',
  sentence: 'You drink from a ____.',
}

const cueL3: Screen = { kind: 'cue', level: 3, word: 'cup' }

const candidatesL2: Screen = {
  kind: 'candidates',
  level: 2,
  index: 0,
  items: [
    { word: 'cup', confidence: 0.9, source: 'bank' },
    { word: 'mug', confidence: 0.7, source: 'bank' },
    { word: 'glass', confidence: 0.5, source: 'bank' },
  ],
}

const candidatesL3: Screen = {
  kind: 'candidates',
  level: 3,
  index: 1,
  items: [
    { word: 'cup', confidence: 0.9, source: 'bank' },
    { word: 'mug', confidence: 0.7, source: 'bank' },
    { word: 'glass', confidence: 0.5, source: 'bank' },
  ],
}

/** Dev playlist: all base kinds plus extra cue/candidates levels. */
export const devPreviewPlaylist: Screen[] = [
  sketchScreens.blank,
  sketchScreens.prompt,
  cueL1,
  sketchScreens.cue,
  cueL3,
  sketchScreens.feedback,
  sketchScreens.candidates,
  candidatesL2,
  candidatesL3,
  sketchScreens.menu,
  sketchScreens.status,
]
