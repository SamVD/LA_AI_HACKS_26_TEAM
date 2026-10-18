import type { Screen } from '../../core/types'
import { candidateDisplay } from './candidateLetters'
import { collectImageKeys } from './collectImageKeys'
import { previewImageUrl } from './previewAssets'

export type PreviewCaptionOptions = {
  /** Dev harness only: include asset keys (can reveal target words at cue L1). */
  showAssetKeys?: boolean
}

function assetLine(key: string, kind: 'picture' | 'mouth', showAssetKeys: boolean): string {
  const loaded = previewImageUrl(key) ? 'loaded' : 'placeholder'
  if (showAssetKeys) return `${kind} ${key} (${loaded})`
  return `${kind} (${loaded})`
}

/** Companion caption under the G2 preview (user + judges). */
export function describePreviewScreen(screen: Screen, options: PreviewCaptionOptions = {}): string {
  const showAssetKeys = options.showAssetKeys === true
  const head = `Screen: ${screen.kind}`
  switch (screen.kind) {
    case 'cue':
      if (screen.level === 1) {
        const parts: string[] = [`cue L1`]
        if (screen.imageKey) parts.push(assetLine(screen.imageKey, 'picture', showAssetKeys))
        else if (screen.mouthKey) parts.push(assetLine(screen.mouthKey, 'mouth', showAssetKeys))
        if (screen.word) parts.push(`word hidden until L3`)
        return `${head} · ${parts.join(' · ')}`
      }
      if (screen.level === 2) return `${head} · cue L2 masked`
      return `${head} · cue L3 · ${screen.word}`
    case 'candidates': {
      const item = screen.items[screen.index]
      const parts = [`candidates L${screen.level}`, `${screen.index + 1}/${screen.items.length}`]
      if (item) {
        if (screen.level === 3) parts.push(item.word)
        else parts.push(candidateDisplay(item.word, screen.level))
      }
      return `${head} · ${parts.join(' · ')}`
    }
    case 'prompt':
      return `${head} · practice prompt`
    case 'feedback':
      return `${head} · ${screen.ok ? 'correct' : 'try again'} · ${screen.word}`
    case 'menu':
      return `${head} · ${screen.items[screen.index] ?? 'menu'}`
    case 'status':
      return `${head}`
    case 'blank':
      return `${head} · listening (blank)`
    default:
      return head
  }
}

/** Keys the preview tried to rasterize for this screen. */
export function previewAssetKeys(screen: Screen): string[] {
  return collectImageKeys(screen)
}
