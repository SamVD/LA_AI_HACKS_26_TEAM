import { getThemeCssVariables, type ThemeMode } from './tokens'

function resolveThemeMode(): ThemeMode {
  const root = document.documentElement
  const stored = root.dataset.theme
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/** Apply design tokens to `target` (defaults to `document.documentElement`). */
export function applyPhoneTheme(
  mode: ThemeMode = resolveThemeMode(),
  target: HTMLElement = document.documentElement,
): void {
  target.dataset.theme = mode
  const vars = getThemeCssVariables(mode)
  for (const [name, value] of Object.entries(vars)) {
    target.style.setProperty(name, value)
  }
}

/** Follow system theme until the user sets `data-theme` explicitly. */
export function watchThemePreference(): () => void {
  const media = window.matchMedia('(prefers-color-scheme: light)')
  const onChange = () => {
    if (!document.documentElement.dataset.themeLocked) {
      applyPhoneTheme(media.matches ? 'light' : 'dark')
    }
  }
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
