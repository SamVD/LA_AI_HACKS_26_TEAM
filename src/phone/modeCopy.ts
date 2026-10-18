import type { ModeId } from '../core/types'

/** One calm line per mode on the companion Home tab. */
export const MODE_HOME_LEAD: Record<ModeId, string> = {
  step1: 'Practice word-finding on the G2.',
  step2: 'Glasses stay blank in conversation; tap the touchpad when you need a word.',
  step3: 'Quiet hints after a pause (Step 3, later).',
}

export function modeDisabledLead(id: ModeId): string {
  if (id === 'step2') return 'Not in this build. Use a Beta pack built with Step 2 enabled.'
  if (id === 'step3') return 'Coming soon.'
  return 'Coming soon.'
}
