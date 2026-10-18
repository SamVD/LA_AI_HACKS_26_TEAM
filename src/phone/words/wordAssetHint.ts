import { resolveAssets } from '../../content'
import type { WordEntry } from '../../core/types'
import { buildPersonalEntry } from '../personalWord'

export function formatWordAssetHint(assets: { imageKey?: string; mouthKey?: string }): string {
  const picture = assets.imageKey ? `picture ${assets.imageKey}` : 'picture none (text-only)'
  const mouth = assets.mouthKey ? `mouth ${assets.mouthKey}` : 'mouth none'
  return `Step 1 cues: ${picture} · ${mouth}`
}

/** Preview resolveAssets for a word before it is saved (category does not affect cues). */
export function resolveDraftPersonalAssets(
  word: string,
  takenIds: ReadonlySet<string>,
): { imageKey?: string; mouthKey?: string } {
  const trimmed = word.trim()
  if (!trimmed) return {}
  const entry: WordEntry = buildPersonalEntry(trimmed, 'other', [], { takenIds })
  return resolveAssets(entry)
}

export function describeWordAssetHint(word: string, takenIds: ReadonlySet<string> = new Set()): string | null {
  const trimmed = word.trim()
  if (!trimmed) return null
  return formatWordAssetHint(resolveDraftPersonalAssets(trimmed, takenIds))
}
