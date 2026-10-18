import { cssVarNames } from './tokens'

/** Apply design tokens to `target` (defaults to `document.documentElement`). */
export function applyPhoneTheme(target: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(cssVarNames)) {
    target.style.setProperty(name, value)
  }
}
