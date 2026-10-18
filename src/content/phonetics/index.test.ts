import { describe, expect, it } from 'vitest'
import { mouthKeyFor } from './index'

describe('mouthKeyFor', () => {
  it.each([
    ['cup', 'back'], ['cat', 'back'], ['car', 'back'], ['cake', 'back'], ['coat', 'back'], ['key', 'back'],
    ['goat', 'back'], ['gift', 'back'], ['gum', 'back'], ['queen', 'back'], ['ghost', 'back'], ['thing', 'tongue-teeth'],
    ['think', 'tongue-teeth'], ['thumb', 'tongue-teeth'], ['the', 'tongue-teeth'], ['this', 'tongue-teeth'], ['those', 'tongue-teeth'],
    ['shoe', 'pucker'], ['ship', 'pucker'], ['chair', 'pucker'], ['cheese', 'pucker'], ['judge', 'pucker'], ['jam', 'pucker'],
    ['phone', 'lip-teeth'], ['photo', 'lip-teeth'], ['fish', 'lip-teeth'], ['fork', 'lip-teeth'], ['van', 'lip-teeth'], ['very', 'lip-teeth'],
    ['ball', 'lips-closed'], ['baby', 'lips-closed'], ['mom', 'lips-closed'], ['person', 'lips-closed'], ['medicine', 'lips-closed'], ['metformin', 'lips-closed'],
    ['apple', 'open'], ['after', 'open'], ['hour', 'open'], ['honest', 'open'], ['honor', 'open'], ['heir', 'open'],
    ['water', 'rounded'], ['orange', 'rounded'], ['round', 'rounded'], ['write', 'rounded'], ['one', 'rounded'], ['once', 'rounded'],
    ['use', 'wide'], ['usual', 'wide'], ['university', 'wide'], ['Europe', 'wide'], ['yellow', 'wide'], ['eel', 'wide'],
    ['spoon', 'teeth-together'], ['city', 'teeth-together'], ['sun', 'teeth-together'], ['zebra', 'teeth-together'], ['psychology', 'teeth-together'], ['lisinopril', 'tongue-up'],
    ['knife', 'tongue-up'], ['gnome', 'tongue-up'], ['name', 'tongue-up'], ['door', 'tongue-up'], ['tea', 'tongue-up'], ['love', 'tongue-up'],
  ] as const)('maps %s to %s', (word, shape) => {
    expect(mouthKeyFor(word)).toBe(`mouth:${shape}`)
  })

  it('uses explicit first-sound overrides before spelling, normalizing IPA-like delimiters and accents', () => {
    expect(mouthKeyFor('Dr. Velrin', '/v/')).toBe('mouth:lip-teeth')
    expect(mouthKeyFor('Xiomara', 'sh')).toBe('mouth:pucker')
    expect(mouthKeyFor('Élodie', 'ee')).toBe('mouth:wide')
    expect(mouthKeyFor('unknown', '?')).toBeUndefined()
  })

  it('returns undefined for empty or unsupported input so callers can omit the image', () => {
    expect(mouthKeyFor('')).toBeUndefined()
    expect(mouthKeyFor('🦋')).toBeUndefined()
  })
})
