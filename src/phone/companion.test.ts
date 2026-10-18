import { describe, expect, it } from 'vitest'
import { getMode } from '../modes'
import { createMockContext } from '../mocks'
import {
  PREVIEW_SCREEN_KINDS,
  playlistCoversAllKinds,
  previewPlaylist,
} from './previewPlaylist'
import { PreviewUI } from './previewUi'
import { renderScreenPreview } from './renderScreenPreview'

describe('companion preview', () => {
  it('playlist covers all seven Screen kinds', () => {
    expect(playlistCoversAllKinds()).toBe(true)
    expect(previewPlaylist.length).toBeGreaterThanOrEqual(7)
    for (const kind of PREVIEW_SCREEN_KINDS) {
      expect(previewPlaylist.some(s => s.kind === kind)).toBe(true)
    }
  })

  it('renders preview SVG for each playlist screen', () => {
    for (const screen of previewPlaylist) {
      const svg = renderScreenPreview(screen)
      expect(svg).toContain('viewBox="0 0 576 288"')
      expect(svg).toContain('</svg>')
    }
  })

  it('PreviewUI mirrors MockUI and notifies on show', async () => {
    const seen: string[] = []
    const ui = new PreviewUI(s => seen.push(s.kind))
    await ui.show({ kind: 'blank' })
    await ui.show({ kind: 'prompt', sentence: 'Hi ____.' })
    expect(ui.screens).toHaveLength(2)
    expect(seen).toEqual(['blank', 'prompt'])
  })

  it('starts Step 1 against mocks via PreviewUI', async () => {
    const ui = new PreviewUI(() => {})
    const context = createMockContext({ ui, flags: { step2Enabled: false, step3Enabled: false, imuEnabled: false, mockServices: true } })
    await getMode('step1').enter(context)
    expect(ui.screens.at(-1)).toEqual({ kind: 'status', text: 'step1 not built yet' })
    await getMode('step1').exit()
  })
})
