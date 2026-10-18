import type { SessionRecord } from '../core/types'

export interface Step1ItemSummary {
  word: string
  solvedAtCue: number
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
  const solvedAtCue =
    typeof record.solvedAtCue === 'number' && Number.isFinite(record.solvedAtCue)
      ? record.solvedAtCue
      : 0
  return { word, solvedAtCue }
}

export function summarizeStep1Session(session: SessionRecord): Step1SessionSummary {
  const items: Step1ItemSummary[] = []
  for (const raw of session.items) {
    const item = readItem(raw)
    if (item) items.push(item)
  }
  const solved = items.length
  const solvedWithoutHelp = items.filter(i => i.solvedAtCue === 0).length
  return { solved, solvedWithoutHelp, items }
}
