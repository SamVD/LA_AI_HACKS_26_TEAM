import type { Screen } from '../../core/types'

/** Asset keys referenced by a Screen for cue L1 / candidates L1 previews. */
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
    case 'candidates': {
      const item = screen.items[screen.index]
      if (item) {
        add(item.imageKey)
        add(item.mouthKey)
      }
      break
    }
    default:
      break
  }

  return [...keys]
}
