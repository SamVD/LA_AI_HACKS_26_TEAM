import { describe, expect, it } from 'vitest'
import { builtinBank, getImage, mouthKeyFor, resolveAssets } from './index'
import type { WordEntry } from '../core/types'

const sources = import.meta.glob<string>('./assets/**/*.svg', { query: '?raw', import: 'default', eager: true })
const entry = (word: string, firstSound?: string): WordEntry => ({ id: word, word, firstSound, category: 'other', frames: [], tags: [] })

describe('cue content', () => {
  it('resolves all 30 builtin pictures and keeps sample pictures text-only', () => {
    const bank = builtinBank()
    const practice = bank.filter(word => !word.tags.includes('sample'))
    expect(practice).toHaveLength(30)
    for (const word of practice) {
      const { imageKey, mouthKey } = resolveAssets(word)
      expect(imageKey).toBe(word.id)
      expect(sources[`./assets/pictures/${imageKey}.svg`]).toBeDefined()
      expect(sources[`./assets/mouth/${mouthKey?.replace('mouth:', '')}.svg`]).toBeDefined()
    }
    for (const word of bank.filter(word => word.tags.includes('sample'))) {
      expect(resolveAssets(word).imageKey).toBeUndefined()
    }
    bank[0].word = 'changed'
    bank[1].tags.push('changed')
    expect(builtinBank()[0].word).toBe('cup')
    expect(builtinBank()[1].tags).not.toContain('changed')
  })
  it('contains safe self-contained vectors with visible white strokes', () => {
    expect(Object.keys(sources)).toHaveLength(65)
    expect(Object.keys(sources).filter(path => path.includes('/mouth/'))).toHaveLength(10)
    for (const svg of Object.values(sources)) {
      expect(svg).toMatch(/^<svg\b[^>]*viewBox="0 0 (24 24|48 32)"/)
      expect(svg).toContain('stroke="#fff"')
      expect(svg).toContain('stroke-width="2"')
      expect(svg).toContain('fill="none"')
      expect(svg).toMatch(/<\/(svg)>\s*$/)
      expect(svg).not.toMatch(/<script|<text|<image|<foreignObject|href\s*=|url\(|on\w+\s*=|gradient/i)
    }
  })
  it('uses explicit picture keys only when the requested picture exists', () => {
    expect(resolveAssets({ ...entry('custom'), imageKey: 'cup' }).imageKey).toBe('cup')
    expect(resolveAssets({ ...entry('cup'), imageKey: 'missing' }).imageKey).toBeUndefined()
    expect(resolveAssets({ ...entry('cup'), imageKey: 'mouth:open' }).imageKey).toBeUndefined()
    expect(resolveAssets(entry('🦋'))).toEqual({ imageKey: undefined, mouthKey: undefined })
  })
  it.each([
    ['cup', 'back'], ['spoon', 'teeth-together'], ['fork', 'lip-teeth'],
    ['knife', 'tongue-up'], ['phone', 'lip-teeth'], ['cheese', 'pucker'],
    ['shoe', 'pucker'], ['thumb', 'tongue-teeth'], ['water', 'rounded'],
    ['apple', 'open'], ['egg', 'wide'], ['orange', 'rounded'],
    ['gum', 'back'], ['giraffe', 'pucker'], ['cat', 'back'], ['city', 'teeth-together'],
    ['lisinopril', 'tongue-up'], ['metformin', 'lips-closed'], ['banana', 'lips-closed'],
    ['park', 'lips-closed'], ['van', 'lip-teeth'], ['whale', 'rounded'], ['write', 'rounded'],
    ['psychology', 'teeth-together'], ['gnome', 'tongue-up'], ['teeth', 'tongue-up'],
    ['door', 'tongue-up'], ['name', 'tongue-up'], ['zebra', 'teeth-together'],
    ['jelly', 'pucker'], ['ice', 'wide'], ['umbrella', 'rounded'], ['home', 'open'],
  ])('resolves the initial sound of %s', (word, shape) => {
    expect(mouthKeyFor(entry(word))).toBe(`mouth:${shape}`)
  })
  it('honors firstSound before spelling, including unknown overrides', () => {
    expect(mouthKeyFor(entry('Dr. Velrin', 'v'))).toBe('mouth:lip-teeth')
    expect(mouthKeyFor(entry('hour', 'ah'))).toBe('mouth:open')
    expect(mouthKeyFor(entry('gift', 'g'))).toBe('mouth:back')
    expect(mouthKeyFor(entry('one', '/w/'))).toBe('mouth:rounded')
    expect(mouthKeyFor(entry('unusual', 'ee'))).toBe('mouth:wide')
    expect(mouthKeyFor(entry('thing', 'ng'))).toBe('mouth:back')
    expect(mouthKeyFor(entry('cup', '?'))).toBeUndefined()
  })
  it('resolves pictures for common non-bank predictor words', () => {
    // Words the predictor commonly returns outside the builtin bank (T-205 expansion);
    // ad-hoc entries get ids by slugging the word, like predictor adHocEntry does.
    for (const word of [
      'mug', 'glass', 'teacup', 'hospital', 'clinic', 'chair', 'armchair', 'umbrella',
      'raincoat', 'stamp', 'telephone', 'novel', 'bookshop', 'bookmobile', 'cloth',
      'ladle', 'soupspoon', 'slicer', 'mechanic', 'technician', 'spectacles', 'chemist',
      'car keys', 'bread knife', 'postage stamp',
    ]) {
      const slug = word.replace(' ', '-')
      expect(resolveAssets({ ...entry(word), id: slug }).imageKey).toBe(slug)
      expect(sources[`./assets/pictures/${slug}.svg`]).toBeDefined()
    }
  })
  it('returns null in Node for known pictures, mouths, and unknown keys', async () => {
    expect(await getImage('cup', 200, 120)).toBeNull()
    expect(await getImage('mouth:rounded', 180, 108)).toBeNull()
    expect(await getImage('missing', 999, 0)).toBeNull()
  })
})
