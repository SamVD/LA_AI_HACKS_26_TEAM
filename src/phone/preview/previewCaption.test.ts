import { describe, expect, it } from 'vitest'
import { describePreviewScreen } from './previewCaption'

describe('describePreviewScreen', () => {
  it('names cue L1 picture keys and mouth fallback', () => {
    const picture = describePreviewScreen({
      kind: 'cue',
      level: 1,
      word: 'cup',
      imageKey: 'cup',
      sentence: 'I drink from a ____.',
    })
    expect(picture).toContain('cue L1')
    expect(picture).toContain('picture cup')

    const mouth = describePreviewScreen({
      kind: 'cue',
      level: 1,
      word: 'cup',
      mouthKey: 'rounded',
    })
    expect(mouth).toContain('mouth rounded')
  })

  it('describes candidates ladder level', () => {
    const line = describePreviewScreen({
      kind: 'candidates',
      level: 1,
      index: 0,
      items: [{ word: 'cup', confidence: 0.9, imageKey: 'cup', source: 'bank' }],
    })
    expect(line).toContain('candidates L1')
    expect(line).toContain('picture cup')
  })
})
