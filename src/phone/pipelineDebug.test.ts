import { describe, expect, it } from 'vitest'
import { companionShowsDebugTab } from './pipelineDebug'

describe('companionShowsDebugTab', () => {
  it('shows when the dev harness feeds transcripts', () => {
    expect(companionShowsDebugTab(true, '')).toBe(true)
  })

  it('shows when the phone URL has ?debug', () => {
    expect(companionShowsDebugTab(false, '?debug=1')).toBe(true)
    expect(companionShowsDebugTab(false, '')).toBe(false)
  })
})
