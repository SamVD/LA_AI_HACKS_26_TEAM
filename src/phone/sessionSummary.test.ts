import { describe, expect, it } from 'vitest'
import type { SessionRecord } from '../core/types'
import {
  formatSessionStartedAt,
  formatStep1ItemLine,
  formatStep1SessionHeadline,
  summarizeStep1Session,
} from './sessionSummary'

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
    expect(summary.items).toHaveLength(2)
  })

  it('treats null solvedAtCue as not solved and honors skipped', () => {
    const session: SessionRecord = {
      mode: 'step1',
      startedAt: 0,
      items: [
        { word: 'cup', solvedAtCue: null },
        { word: 'fork', skipped: true },
        { word: 'spoon', solvedAtCue: 0 },
      ],
    }
    const summary = summarizeStep1Session(session)
    expect(summary.solved).toBe(1)
    expect(summary.solvedWithoutHelp).toBe(1)
    expect(formatStep1ItemLine(summary.items[0])).toBe('cup · not solved')
    expect(formatStep1ItemLine(summary.items[1])).toBe('fork · skipped')
    expect(formatStep1ItemLine(summary.items[2])).toBe('spoon · solved without cues')
  })

  it('formats session headline and started-at fallback', () => {
    const session: SessionRecord = {
      mode: 'step1',
      startedAt: 0,
      items: [{ word: 'cup', solvedAtCue: 0 }],
    }
    const summary = summarizeStep1Session(session)
    expect(formatSessionStartedAt(0)).toBe('Latest session')
    expect(formatStep1SessionHeadline(session, summary)).toBe(
      'Latest session · 1 solved · 1 without cues',
    )
  })
})
