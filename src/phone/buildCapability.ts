import type { ModeInfo } from '../core/types'

const MODE_LABEL: Record<ModeInfo['id'], string> = {
  step1: 'Practice',
  step2: 'Assist',
  step3: 'Hints',
}

/** One line for Home: which modes ship in this pack (flags at build time). */
export function formatBuildCapabilityLine(modes: ModeInfo[]): string {
  const parts = modes.map(mode => {
    const label = MODE_LABEL[mode.id] ?? mode.title
    return mode.enabled ? label : `${label} off`
  })
  return `This build: ${parts.join(' · ')}`
}
