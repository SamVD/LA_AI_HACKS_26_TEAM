/**
 * Phone companion design tokens (T-006).
 * Calm, high-contrast UI for stroke survivors and caregivers.
 * Glasses preview tokens mirror G2 576×288 green-on-black (see docs/DISPLAY_LIMITS.md).
 */

export const glassesCanvas = {
  width: 576,
  height: 288,
  /** Approximate brightest green on device; preview only. */
  phosphor: '#5cff8a',
  phosphorDim: '#2a6b3f',
  phosphorMuted: '#1a3d28',
  background: '#000000',
  lineHeightPx: 27,
  maxImageWidth: 288,
  maxImageHeight: 144,
} as const

export const phoneTheme = {
  color: {
    bg: '#0c100e',
    bgElevated: '#141a16',
    bgSubtle: '#1c2420',
    text: '#e6f0ea',
    textMuted: '#9fb5a8',
    textFaint: '#6d8478',
    border: '#2d3b34',
    borderStrong: '#3f5248',
    accent: '#6fa88a',
    accentHover: '#86bfa0',
    accentSoft: 'rgba(111, 168, 138, 0.18)',
    focus: '#a8d4bc',
    success: '#7bc49a',
    danger: '#d48484',
    onAccent: '#0c100e',
  },
  font: {
    family:
      'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    size: {
      xs: '0.875rem',
      sm: '1rem',
      md: '1.125rem',
      lg: '1.375rem',
      xl: '1.75rem',
      display: '2rem',
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
    minHeight: '48px',
    minWidth: '48px',
  },
  motion: {
    duration: '160ms',
    easing: 'cubic-bezier(0.33, 1, 0.68, 1)',
  },
} as const

export type PhoneTheme = typeof phoneTheme

/** CSS custom property names applied to `:root` by `applyPhoneTheme`. */
export const cssVarNames = {
  '--nudge-bg': phoneTheme.color.bg,
  '--nudge-bg-elevated': phoneTheme.color.bgElevated,
  '--nudge-bg-subtle': phoneTheme.color.bgSubtle,
  '--nudge-text': phoneTheme.color.text,
  '--nudge-text-muted': phoneTheme.color.textMuted,
  '--nudge-text-faint': phoneTheme.color.textFaint,
  '--nudge-border': phoneTheme.color.border,
  '--nudge-border-strong': phoneTheme.color.borderStrong,
  '--nudge-accent': phoneTheme.color.accent,
  '--nudge-accent-hover': phoneTheme.color.accentHover,
  '--nudge-accent-soft': phoneTheme.color.accentSoft,
  '--nudge-focus': phoneTheme.color.focus,
  '--nudge-success': phoneTheme.color.success,
  '--nudge-danger': phoneTheme.color.danger,
  '--nudge-on-accent': phoneTheme.color.onAccent,
  '--nudge-font': phoneTheme.font.family,
  '--nudge-font-md': phoneTheme.font.size.md,
  '--nudge-font-lg': phoneTheme.font.size.lg,
  '--nudge-font-xl': phoneTheme.font.size.xl,
  '--nudge-radius-md': phoneTheme.radius.md,
  '--nudge-space-4': phoneTheme.space[4],
  '--nudge-space-6': phoneTheme.space[6],
  '--nudge-touch-min': phoneTheme.touch.minHeight,
  '--nudge-glasses-phosphor': glassesCanvas.phosphor,
  '--nudge-glasses-bg': glassesCanvas.background,
} as const
