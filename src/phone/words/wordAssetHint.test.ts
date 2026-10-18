import { describe, expect, it } from 'vitest'
import { describeWordAssetHint, formatWordAssetHint, resolveDraftPersonalAssets } from './wordAssetHint'

describe('wordAssetHint', () => {
  it('formats picture and mouth lines', () => {
    expect(formatWordAssetHint({ imageKey: 'cup', mouthKey: 'mouth:lips-round' })).toBe(
      'Step 1 cues: picture cup · mouth mouth:lips-round',
    )
    expect(formatWordAssetHint({ mouthKey: 'mouth:open' })).toBe(
      'Step 1 cues: picture none (text-only) · mouth mouth:open',
    )
  })

  it('resolves phonetic mouth for a draft personal word', () => {
    const assets = resolveDraftPersonalAssets('spoon', new Set())
    expect(assets.imageKey).toBeUndefined()
    expect(assets.mouthKey).toMatch(/^mouth:/)
  })

  it('returns null for empty input', () => {
    expect(describeWordAssetHint('   ')).toBeNull()
  })

  it('describes a saved-style personal entry', () => {
    const hint = describeWordAssetHint('Maya', new Set())
    expect(hint).toContain('mouth ')
    expect(hint).toContain('text-only')
  })
})
