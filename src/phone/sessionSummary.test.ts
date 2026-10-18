import { describe, expect, it } from 'vitest'
import type { SessionRecord } from '../core/types'
import { summarizeStep1Session } from './sessionSummary'

describe('summarizeStep1Session', () => {
  it('counts solved items and cue levels defensively', () => {
    const session: SessionRecord = {
      mode: 'step1',
      startedAt: 0,
      items: [
        { word: 'cup', solvedAtCue: 0 },
        { word: 'spoon', solvedAtCue: 2 },
        null,
        { nope: true },
      ],
    }
    const summary = summarizeStep1Session(session)
    expect(summary.solved).toBe(2)
    expect(summary.solvedWithoutHelp).toBe(1)
    expect(summary.items).toEqual([
      { word: 'cup', solvedAtCue: 0 },
      { word: 'spoon', solvedAtCue: 2 },
    ])
  })
})
