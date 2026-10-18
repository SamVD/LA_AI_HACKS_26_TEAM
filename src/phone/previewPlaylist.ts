import type { Screen, ScreenKind } from '../core/types'
import { sketchScreens } from './theme/sketchSamples'

/** Fixture playlist covering every `Screen` kind for the preview panel. */
export const previewPlaylist: Screen[] = [
  sketchScreens.blank,
  sketchScreens.prompt,
  sketchScreens.cue,
  sketchScreens.feedback,
  sketchScreens.candidates,
  sketchScreens.menu,
  sketchScreens.status,
]

export const PREVIEW_SCREEN_KINDS: ScreenKind[] = [
  'blank',
  'prompt',
  'cue',
  'feedback',
  'candidates',
  'menu',
  'status',
]

export function playlistCoversAllKinds(): boolean {
  const kinds = new Set(previewPlaylist.map(s => s.kind))
  return PREVIEW_SCREEN_KINDS.every(k => kinds.has(k))
}
