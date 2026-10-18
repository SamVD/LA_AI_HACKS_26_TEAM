/**
 * Phone companion design tokens (T-006).
 * Calm, high-contrast UI for stroke survivors and caregivers.
 */

export const glassesCanvas = {
  width: 576,
  height: 288,
  phosphor: '#5cff8a',
  phosphorDim: '#2a6b3f',
  phosphorMuted: '#1a3d28',
  background: '#000000',
  lineHeightPx: 27,
  maxImageWidth: 288,
  maxImageHeight: 144,
  /** Preview palette: 16 green levels (0 = off … 15 = brightest). */
  greenLevels: [
    '#000000',
    '#0a1f12',
    '#143322',
    '#1e4a31',
    '#286140',
    '#32784f',
    '#3c8f5e',
    '#46a66d',
    '#50bd7c',
    '#5ad48b',
    '#64eb9a',
    '#6effa9',
    '#78ffb8',
    '#82ffc7',
    '#8cffd6',
    '#96ffe5',
  ],
} as const

const sharedScale = {
  font: {
    family:
      'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    size: {
      sm: '1.125rem',
      md: '1.25rem',
      lg: '1.5rem',
      xl: '2rem',
      display: '2.25rem',
      numeric: '1.75rem',
    },
    weight: {
      regular: '400',
      medium: '500',
      semibold: '600',
    },
    lineHeight: {
      tight: '1.25',
      normal: '1.45',
      relaxed: '1.6',
    },
  },
  space: {
    1: '0.25rem',
    2: '0.5rem',
    3: '0.75rem',
    4: '1rem',
    5: '1.25rem',
    6: '1.5rem',
    8: '2rem',
    10: '2.5rem',
  },
  radius: {
    sm: '6px',
    md: '10px',
    lg: '14px',
    pill: '999px',
  },
  shadow: {
    soft: '0 2px 12px rgba(0, 0, 0, 0.35)',
  },
  touch: {
    minHeight: '56px',
    minWidth: '56px',
  },
  motion: {
    duration: '160ms',
    easing: 'cubic-bezier(0.33, 1, 0.68, 1)',
  },
} as const

/** Dark companion theme (default). Body/on-accent pairs meet WCAG AAA (7:1). */
export const phoneThemeDark = {
  ...sharedScale,
  color: {
    bg: '#0a0e0c',
    bgElevated: '#121814',
    bgSubtle: '#1a221c',
    text: '#eef5f0',
    textMuted: '#b8d0c4',
    /** Decorative only (borders, dividers) — not for essential copy. */
    textFaint: '#7a9488',
    border: '#2a3630',
    borderStrong: '#3d4d44',
    accent: '#2a5340',
    accentHover: '#35624c',
    accentSoft: 'rgba(61, 107, 84, 0.2)',
    focus: '#c8e8d4',
    success: '#8fd4a8',
    danger: '#f0b0b0',
    onAccent: '#ffffff',
  },
} as const

export const phoneThemeLight = {
  ...sharedScale,
  color: {
    bg: '#f2f6f3',
    bgElevated: '#ffffff',
    bgSubtle: '#e4ebe6',
    text: '#0a120e',
    textMuted: '#2f4538',
    textFaint: '#5c7266',
    border: '#c5d4cb',
    borderStrong: '#9fb5a8',
    accent: '#1f4a38',
    accentHover: '#2a5c47',
    accentSoft: 'rgba(47, 90, 70, 0.12)',
    focus: '#1f4d38',
    success: '#2d6b4a',
    danger: '#6b1818',
    onAccent: '#ffffff',
  },
} as const

export type PhoneTheme = typeof phoneThemeDark | typeof phoneThemeLight
export type ThemeMode = 'dark' | 'light'

export const phoneTheme = phoneThemeDark

function themeToCssVars(theme: PhoneTheme): Record<string, string> {
  const { color, font, space, radius, touch, motion } = theme
  return {
    '--nudge-bg': color.bg,
    '--nudge-bg-elevated': color.bgElevated,
    '--nudge-bg-subtle': color.bgSubtle,
    '--nudge-text': color.text,
    '--nudge-text-muted': color.textMuted,
    '--nudge-text-faint': color.textFaint,
    '--nudge-border': color.border,
    '--nudge-border-strong': color.borderStrong,
    '--nudge-accent': color.accent,
    '--nudge-accent-hover': color.accentHover,
    '--nudge-accent-soft': color.accentSoft,
    '--nudge-focus': color.focus,
    '--nudge-success': color.success,
    '--nudge-danger': color.danger,
    '--nudge-on-accent': color.onAccent,
    '--nudge-font': font.family,
    '--nudge-font-sm': font.size.sm,
    '--nudge-font-md': font.size.md,
    '--nudge-font-lg': font.size.lg,
    '--nudge-font-xl': font.size.xl,
    '--nudge-font-display': font.size.display,
    '--nudge-font-numeric': font.size.numeric,
    '--nudge-radius-sm': radius.sm,
    '--nudge-radius-md': radius.md,
    '--nudge-radius-lg': radius.lg,
    '--nudge-space-1': space[1],
    '--nudge-space-2': space[2],
    '--nudge-space-3': space[3],
    '--nudge-space-4': space[4],
    '--nudge-space-5': space[5],
    '--nudge-space-6': space[6],
    '--nudge-space-8': space[8],
    '--nudge-space-10': space[10],
    '--nudge-touch-min': touch.minHeight,
    '--nudge-motion-duration': motion.duration,
    '--nudge-motion-easing': motion.easing,
    '--nudge-glasses-phosphor': glassesCanvas.phosphor,
    '--nudge-glasses-bg': glassesCanvas.background,
  }
}

export function getThemeCssVariables(mode: ThemeMode): Record<string, string> {
  return themeToCssVars(mode === 'light' ? phoneThemeLight : phoneThemeDark)
}

/** @deprecated Use getThemeCssVariables — kept for importers. */
export const cssVarNames = getThemeCssVariables('dark')
