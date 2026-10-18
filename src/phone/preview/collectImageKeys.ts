import type { Screen } from '../../core/types'

/** Asset keys referenced by a Screen for Step 1 cue L1 previews (not candidates; v3 is letters-only). */
export function collectImageKeys(screen: Screen): string[] {
  const keys = new Set<string>()
  const add = (key?: string) => {
    if (key) keys.add(key)
  }

  switch (screen.kind) {
    case 'cue':
      add(screen.imageKey)
      add(screen.mouthKey)
      break
    case 'candidates':
      break
    default:
      break
  }

  return [...keys]
}
