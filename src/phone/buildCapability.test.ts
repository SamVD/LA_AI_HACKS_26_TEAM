import { describe, expect, it } from 'vitest'
import { formatBuildCapabilityLine } from './buildCapability'

describe('formatBuildCapabilityLine', () => {
  it('lists enabled modes and marks disabled ones', () => {
    const line = formatBuildCapabilityLine([
      { id: 'step1', title: 'Practice', enabled: true },
      { id: 'step2', title: 'Assist', enabled: true },
      { id: 'step3', title: 'Hints', enabled: false },
    ])
    expect(line).toBe('This build: Practice · Assist · Hints off')
  })
})
