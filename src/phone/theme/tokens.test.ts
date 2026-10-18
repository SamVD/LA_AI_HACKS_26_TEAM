import { describe, expect, it } from 'vitest'
import {
  LAYOUT_SKETCH_IDS,
  renderGlassesSketch,
  renderLayoutSketch,
} from './renderGlassesSketch'
import { sketchScreens } from './sketchSamples'
import { getThemeCssVariables, glassesCanvas, phoneThemeDark, phoneThemeLight } from './tokens'

function luminance(hex: string): number {
  const raw = hex.replace('#', '')
  const r = parseInt(raw.slice(0, 2), 16) / 255
  const g = parseInt(raw.slice(2, 4), 16) / 255
  const b = parseInt(raw.slice(4, 6), 16) / 255
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(fg)
  const l2 = luminance(bg)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('phone theme', () => {
  it('uses 56px-class touch minimum and 20px body', () => {
    expect(parseInt(phoneThemeDark.touch.minHeight, 10)).toBeGreaterThanOrEqual(56)
    expect(parseFloat(phoneThemeDark.font.size.md)).toBeGreaterThanOrEqual(1.25)
  })

  it('meets 7:1 contrast for essential text pairs (dark + light)', () => {
    for (const theme of [phoneThemeDark, phoneThemeLight]) {
      expect(contrastRatio(theme.color.text, theme.color.bg)).toBeGreaterThanOrEqual(7)
      expect(contrastRatio(theme.color.textMuted, theme.color.bg)).toBeGreaterThanOrEqual(7)
      expect(contrastRatio(theme.color.onAccent, theme.color.accent)).toBeGreaterThanOrEqual(7)
      expect(contrastRatio(theme.color.danger, theme.color.bg)).toBeGreaterThanOrEqual(7)
    }
  })

  it('exports CSS variables for motion and spacing', () => {
    const vars = getThemeCssVariables('dark')
    expect(vars['--nudge-motion-duration']).toBeTruthy()
    expect(vars['--nudge-space-2']).toBeTruthy()
    expect(vars['--nudge-radius-lg']).toBeTruthy()
  })

  it('matches G2 canvas size', () => {
    expect(glassesCanvas.width).toBe(576)
    expect(glassesCanvas.height).toBe(288)
    expect(glassesCanvas.greenLevels.length).toBe(16)
  })

  it('renders every layout sketch at 27px line height', () => {
    for (const id of LAYOUT_SKETCH_IDS) {
      const svg = renderLayoutSketch(id)
      expect(svg).toContain('viewBox="0 0 576 288"')
      expect(svg).toContain(`font-size="${glassesCanvas.lineHeightPx}"`)
      expect(svg).toMatch(/stroke-dasharray/)
    }
  })

  it('maps Screen kinds to sketches and uses G2-safe feedback', () => {
    const ok = renderGlassesSketch(sketchScreens.feedback)
    expect(ok).toContain('√')
    expect(ok).not.toContain('✓')
  })
})
