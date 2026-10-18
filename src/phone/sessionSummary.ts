import type { SessionRecord } from '../core/types'

export type Step1ItemStatus = 'solved' | 'skipped' | 'not-solved'

export interface Step1ItemSummary {
  word: string
  status: Step1ItemStatus
  /** Present when status is `solved`. */
  solvedAtCue?: 0 | 1 | 2 | 3
}

export interface Step1SessionSummary {
  solved: number
  solvedWithoutHelp: number
  items: Step1ItemSummary[]
}

function readItem(raw: unknown): Step1ItemSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const word = typeof record.word === 'string' ? record.word : null
  if (!word) return null

  if (record.skipped === true) {
    return { word, status: 'skipped' }
  }

  const cue = record.solvedAtCue
  if (cue === null || cue === undefined) {
    return { word, status: 'not-solved' }
  }
  if (typeof cue === 'number' && cue >= 0 && cue <= 3 && Number.isFinite(cue)) {
    return { word, status: 'solved', solvedAtCue: cue as 0 | 1 | 2 | 3 }
  }
  return { word, status: 'not-solved' }
}

export function summarizeStep1Session(session: SessionRecord): Step1SessionSummary {
  const items: Step1ItemSummary[] = []
  for (const raw of session.items) {
    const item = readItem(raw)
    if (item) items.push(item)
  }
  const solvedItems = items.filter(i => i.status === 'solved')
  const solved = solvedItems.length
  const solvedWithoutHelp = solvedItems.filter(i => i.solvedAtCue === 0).length
  return { solved, solvedWithoutHelp, items }
}

export function formatStep1ItemLine(item: Step1ItemSummary): string {
  if (item.status === 'skipped') return `${item.word} · skipped`
  if (item.status === 'not-solved') return `${item.word} · not solved`
  return `${item.word} · cue ${item.solvedAtCue}`
}
