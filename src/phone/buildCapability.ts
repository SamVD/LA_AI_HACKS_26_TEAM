import type { ModeInfo } from '../core/types'

const MODE_LABEL: Record<ModeInfo['id'], string> = {
  step1: 'Practice',
  step2: 'Assist',
  step3: 'Conversation',
}

/** One line for Home: which modes ship in this pack (flags at build time). */
export function formatBuildCapabilityLine(modes: ModeInfo[]): string {
  const conversationBuild = modes.find(m => m.id === 'step3')?.enabled === true
  const visible = conversationBuild ? modes.filter(m => m.id !== 'step2') : modes
  const parts = visible.map(mode => {
    const label = MODE_LABEL[mode.id] ?? mode.title
    return mode.enabled ? label : `${label} off`
  })
  return `This build: ${parts.join(' · ')}`
}
