import type { ModeId } from '../core/types'

/** One calm line per mode on the companion Home tab. */
export const MODE_HOME_LEAD: Record<ModeId, string> = {
  step1: 'Practice word-finding on the G2.',
  step2: 'Glasses stay blank in conversation; tap the touchpad when you need a word.',
  step3:
    'Same as Assist, but the glasses can offer a quiet hint after a pause. Swipe on a blank display to pause auto-hints.',
}

export function modeDisabledLead(id: ModeId): string {
  if (id === 'step2') return 'Not in this build. Use a Beta pack built with Step 2 enabled.'
  if (id === 'step3') return 'Not in this build. Pack with Step 3 enabled (VITE_STEP3=1).'
  return 'Coming soon.'
}
