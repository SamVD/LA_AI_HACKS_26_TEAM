import { describe, expect, it } from 'vitest'
import type { ScreenKind } from '../../core/types'
import { renderGlassesSketch } from './renderGlassesSketch'
import { sketchScreens } from './sketchSamples'
import { glassesCanvas, phoneTheme } from './tokens'

const ALL_KINDS: ScreenKind[] = [
  'blank',
  'prompt',
  'cue',
  'feedback',
  'candidates',
  'menu',
  'status',
]

describe('phone theme', () => {
  it('uses accessible touch minimum', () => {
    expect(parseInt(phoneTheme.touch.minHeight, 10)).toBeGreaterThanOrEqual(48)
  })

  it('matches G2 canvas size', () => {
    expect(glassesCanvas.width).toBe(576)
    expect(glassesCanvas.height).toBe(288)
  })

  it('renders an SVG sketch for every Screen kind', () => {
    for (const kind of ALL_KINDS) {
      const svg = renderGlassesSketch(sketchScreens[kind])
      expect(svg).toContain('viewBox="0 0 576 288"')
      expect(svg).toContain('</svg>')
    }
  })

  it('uses G2-safe feedback symbols', () => {
    const ok = renderGlassesSketch(sketchScreens.feedback)
    expect(ok).toContain('√')
    expect(ok).not.toContain('✓')
  })
})
