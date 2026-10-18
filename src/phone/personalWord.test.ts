import { describe, expect, it } from 'vitest'
import { buildPersonalEntry, slugPersonalId } from './personalWord'

describe('personalWord', () => {
  it('builds stable ids and frames', () => {
    expect(slugPersonalId('Maya')).toBe('p-maya')
    const entry = buildPersonalEntry('Maya', 'person', ['daughter'])
    expect(entry.id).toBe('p-maya')
    expect(entry.frames[0]).toContain('____')
    expect(entry.tags).toEqual(['daughter'])
  })
})
