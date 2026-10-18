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

  it('shows when the pack sets VITE_DEBUG=1 (G3 re-run on device)', () => {
    expect(companionShowsDebugTab(false, '', true)).toBe(true)
    expect(companionShowsDebugTab(false, '', false)).toBe(false)
  })
})
