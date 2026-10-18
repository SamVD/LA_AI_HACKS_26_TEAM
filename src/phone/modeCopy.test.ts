import { describe, expect, it } from 'vitest'
import { MODE_HOME_LEAD, modeDisabledLead } from './modeCopy'

describe('modeCopy', () => {
  it('describes each mode for Home', () => {
    expect(MODE_HOME_LEAD.step1).toContain('Practice')
    expect(MODE_HOME_LEAD.step2).toContain('blank')
    expect(modeDisabledLead('step2')).toContain('Beta')
    expect(MODE_HOME_LEAD.step3).toContain('after a pause')
    expect(modeDisabledLead('step3')).toContain('VITE_STEP3')
  })
})
