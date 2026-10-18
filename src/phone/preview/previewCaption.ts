import type { Screen } from '../../core/types'
import { collectImageKeys } from './collectImageKeys'
import { previewImageUrl } from './previewAssets'

function assetLine(key: string, kind: 'picture' | 'mouth'): string {
  const loaded = previewImageUrl(key) ? 'loaded' : 'placeholder'
  return `${kind} ${key} (${loaded})`
}

/** Companion caption under the G2 preview (dev + judges). */
export function describePreviewScreen(screen: Screen): string {
  const head = `Screen: ${screen.kind}`
  switch (screen.kind) {
    case 'cue':
      if (screen.level === 1) {
        const parts: string[] = [`cue L1`]
        if (screen.imageKey) parts.push(assetLine(screen.imageKey, 'picture'))
        else if (screen.mouthKey) parts.push(assetLine(screen.mouthKey, 'mouth'))
        if (screen.word) parts.push(`word hidden until L3`)
        return `${head} · ${parts.join(' · ')}`
      }
      if (screen.level === 2) return `${head} · cue L2 masked`
      return `${head} · cue L3 · ${screen.word}`
    case 'candidates': {
      const item = screen.items[screen.index]
      const parts = [`candidates L${screen.level}`, `${screen.index + 1}/${screen.items.length}`]
      if (screen.level === 1 && item) {
        if (item.mouthKey) parts.push(assetLine(item.mouthKey, 'mouth'))
        else if (item.imageKey) parts.push(assetLine(item.imageKey, 'picture'))
        else parts.push('text only')
      } else if (item) {
        parts.push(item.word)
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
