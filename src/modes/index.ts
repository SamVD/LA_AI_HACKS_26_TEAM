import type { Mode, ModeId } from '../core/types'
import step1 from './step1'
import step2 from './step2'
import step3 from './step3'

export const modes: Record<ModeId, Mode> = { step1, step2, step3 }

export function getMode(id: ModeId): Mode {
  return modes[id]
}
