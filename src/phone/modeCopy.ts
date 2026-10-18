import type { ModeId } from '../core/types'

/** One calm line per mode on the companion Home tab. */
export const MODE_HOME_LEAD: Record<ModeId, string> = {
  step1: 'Name everyday things with gentle letter cues.',
  step2: 'Glasses stay blank in conversation; tap the touchpad when you need a word.',
  step3:
    'Talk normally. If you pause on a word, a hint appears on the glasses. Tap anytime for help.',
}

export function modeDisabledLead(id: ModeId): string {
  if (id === 'step2') return 'Not in this build. Use a Beta pack built with Step 2 enabled.'
  if (id === 'step3') return 'Not in this build. Pack with Step 3 enabled (VITE_STEP3=1).'
  return 'Coming soon.'
}
