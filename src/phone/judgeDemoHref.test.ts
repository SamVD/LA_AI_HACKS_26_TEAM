import { afterEach, describe, expect, it, vi } from 'vitest'
import { judgeDemoHref } from './judgeDemoHref'

describe('judgeDemoHref', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves the demo page on the current origin', () => {
    vi.stubGlobal('window', { location: { origin: 'https://example.test' } })
    expect(judgeDemoHref()).toBe('https://example.test/src/phone/demo/index.html')
  })
})
