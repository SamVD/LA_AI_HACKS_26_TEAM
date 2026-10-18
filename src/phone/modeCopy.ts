import type { ModeId } from '../core/types'

/** One calm line per mode on the companion Home tab. */
export const MODE_HOME_LEAD: Record<ModeId, string> = {
  step1: 'Practice word-finding on the G2.',
  step2: 'Glasses stay blank in conversation; tap the touchpad when you need a word.',
  step3: 'Hints appear on their own after a pause; tap anytime for help.',
}

export function modeDisabledLead(id: ModeId): string {
  if (id === 'step2') return 'Not in this build. Use a Beta pack built with Step 2 enabled.'
  if (id === 'step3') return 'Not in this build. Pack with Step 3 enabled (VITE_STEP3=1).'
  return 'Coming soon.'
}
