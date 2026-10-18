import { describe, expect, it } from 'vitest'
import { glassesCanvas } from '../theme/tokens'
import { devPreviewPlaylist } from '../dev/previewPlaylist'
import { renderScreen } from './renderScreen'

describe('renderScreen', () => {
  it('renders valid SVG for dev playlist screens', () => {
    for (const screen of devPreviewPlaylist) {
      const svg = renderScreen(screen)
      expect(svg).toContain('viewBox="0 0 576 288"')
      expect(svg).not.toContain('✓')
      expect(svg).not.toContain('✗')
    }
  })

  it('escapes angle brackets and uses one content font size', () => {
    const svg = renderScreen({ kind: 'status', text: '<script>' })
    expect(svg).toContain('&lt;script&gt;')
    const sizes = [...svg.matchAll(/font-size="(\d+)"/g)].map(m => m[1])
    expect(sizes.every(s => s === String(glassesCanvas.lineHeightPx))).toBe(true)
  })

  it('marks the selected menu item and spaces cue masked letters', () => {
    const menu = renderScreen({
      kind: 'menu',
      title: 'Nudge',
      items: ['One', 'Two'],
      index: 1,
    })
    expect(menu).toContain('&gt; Two')
    expect(menu).toContain('  One')

    const cue = renderScreen({
      kind: 'cue',
      level: 2,
      word: 'cup',
      masked: 'c_p',
    })
    expect(cue).toContain('c _ p')
  })

  it('renders letters-first candidates (CONTRACT v3)', () => {
    const cueL1 = renderScreen({
      kind: 'cue',
      level: 1,
      word: 'cup',
      imageKey: 'cup-line',
      sentence: 'You drink from a ____.',
    })
    expect(cueL1).not.toContain('>cup</text>')
    expect(cueL1).not.toContain('cup-line')
    expect(cueL1).toContain('(picture)')

    const l1 = renderScreen({
      kind: 'candidates',
      level: 1,
      index: 0,
      items: [{ word: 'cup', confidence: 1, mouthKey: 'round-lips', source: 'bank' }],
    })
    expect(l1).toContain('1/1')
    expect(l1).toContain('L1')
    expect(l1).toContain('c _ _')
    expect(l1).not.toContain('>cup</text>')
    expect(l1).not.toContain('(mouth)')

    const l2 = renderScreen({
      kind: 'candidates',
      level: 2,
      index: 0,
      items: [{ word: 'sunny', confidence: 1, source: 'bank' }],
    })
    expect(l2).toContain('s u n _ _')
    expect(l2).not.toContain('>sunny</text>')

    const l3 = renderScreen({
      kind: 'candidates',
      level: 3,
      index: 0,
      items: [{ word: 'cup', confidence: 1, source: 'bank' }],
    })
    expect(l3).toContain('>cup</text>')
  })
})
