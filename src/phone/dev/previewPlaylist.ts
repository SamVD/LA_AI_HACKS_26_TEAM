import type { Screen } from '../../core/types'
import { mouthKeyFor } from '../../content'
import { sketchScreens } from '../theme/sketchSamples'

const cupMouth = mouthKeyFor({ id: 'cup', word: 'cup', category: 'object', frames: [], tags: [] })

const cueL1: Screen = {
  kind: 'cue',
  level: 1,
  word: 'cup',
  imageKey: 'cup',
  sentence: 'I drink tea from a ____ with a handle.',
}

const cueL3: Screen = { kind: 'cue', level: 3, word: 'cup' }

const candidatesL1: Screen = {
  kind: 'candidates',
  level: 1,
  index: 0,
  items: [
    { word: 'cup', confidence: 0.9, imageKey: 'cup', source: 'bank' },
    { word: 'water', confidence: 0.7, imageKey: 'water', source: 'bank' },
    { word: 'tea', confidence: 0.5, imageKey: 'tea', source: 'bank' },
  ],
}

const candidatesL2: Screen = {
  kind: 'candidates',
  level: 2,
  index: 0,
  items: [
    { word: 'cup', confidence: 0.9, mouthKey: cupMouth, source: 'bank' },
    { word: 'water', confidence: 0.7, source: 'bank' },
    { word: 'tea', confidence: 0.5, source: 'bank' },
  ],
}

const candidatesL3: Screen = {
  kind: 'candidates',
  level: 3,
  index: 1,
  items: [
    { word: 'cup', confidence: 0.9, source: 'bank' },
    { word: 'water', confidence: 0.7, source: 'bank' },
    { word: 'tea', confidence: 0.5, source: 'bank' },
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
  candidatesL1,
  candidatesL2,
  candidatesL3,
  sketchScreens.menu,
  sketchScreens.status,
]
