import { describe, expect, it } from 'vitest'
import {
  allocatePersonalId,
  buildPersonalEntry,
  slugPersonalId,
  validatePracticeFrame,
} from './personalWord'

describe('personalWord', () => {
  it('defaults to no Step 1 frames', () => {
    const entry = buildPersonalEntry('Maya', 'person', ['daughter'], {
      takenIds: new Set(),
    })
    expect(entry.frames).toEqual([])
    expect(entry.tags).toEqual(['daughter'])
  })

  it('accepts an optional practice frame', () => {
    const entry = buildPersonalEntry('Maya', 'person', [], {
      practiceFrame: 'My daughter is called ____.',
      takenIds: new Set(),
    })
    expect(entry.frames).toEqual(['My daughter is called ____.'])
  })

  it('rejects invalid practice frames', () => {
    expect(validatePracticeFrame('no blank').ok).toBe(false)
    expect(validatePracticeFrame('____ and ____').ok).toBe(false)
    expect(validatePracticeFrame(`${'x'.repeat(52)}____`).ok).toBe(false)
  })

  it('allocates a suffix when the base id is taken', () => {
    const taken = new Set(['p-maya'])
    expect(allocatePersonalId('Maya', taken)).toBe('p-maya-2')
    expect(slugPersonalId('Maya')).toBe('p-maya')
  })

  it('disambiguates empty slugs for non-Latin names', () => {
    const taken = new Set<string>()
    const first = allocatePersonalId('李明', taken)
    expect(first).toBe('p-word')
    taken.add(first)
    expect(allocatePersonalId('王芳', taken)).toBe('p-word-2')
  })
})
