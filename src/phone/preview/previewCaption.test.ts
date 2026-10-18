import { describe, expect, it } from 'vitest'
import { describePreviewScreen } from './previewCaption'

const cueL1Picture = {
  kind: 'cue' as const,
  level: 1 as const,
  word: 'cup',
  imageKey: 'cup',
  sentence: 'I drink from a ____.',
}

const candidatesL1 = {
  kind: 'candidates' as const,
  level: 1 as const,
  index: 0,
  items: [{ word: 'cup', confidence: 0.9, imageKey: 'cup', source: 'bank' as const }],
}

describe('describePreviewScreen', () => {
  it('hides target words at cue L1 and candidates L1/L2 (production captions)', () => {
    const picture = describePreviewScreen(cueL1Picture)
    expect(picture).toContain('cue L1')
    expect(picture).toContain('picture (')
    expect(picture).not.toContain('cup')

    const mouth = describePreviewScreen({
      kind: 'cue',
      level: 1,
      word: 'cup',
      mouthKey: 'mouth:rounded',
    })
    expect(mouth).toContain('mouth (')
    expect(mouth).not.toContain('cup')

    const c1 = describePreviewScreen(candidatesL1)
    expect(c1).toContain('candidates L1')
    expect(c1).not.toContain('cup')

    const c2 = describePreviewScreen({
      kind: 'candidates',
      level: 2,
      index: 0,
      items: [{ word: 'cup', confidence: 0.9, source: 'bank' }],
    })
    expect(c2).toContain('candidates L2')
    expect(c2).toContain('c')
    expect(c2).not.toContain('cup')
  })

  it('shows the word at cue L3 and candidates L3', () => {
    expect(
      describePreviewScreen({
        kind: 'cue',
        level: 3,
        word: 'cup',
        sentence: 'I drink from a ____.',
      }),
    ).toContain('cup')

    expect(
      describePreviewScreen({
        kind: 'candidates',
        level: 3,
        index: 0,
        items: [{ word: 'cup', confidence: 0.9, source: 'bank' }],
      }),
    ).toContain('cup')
  })

  it('can include asset keys in dev mode', () => {
    const line = describePreviewScreen(cueL1Picture, { showAssetKeys: true })
    expect(line).toContain('picture cup')
    expect(line).toContain('cup')
  })
})
