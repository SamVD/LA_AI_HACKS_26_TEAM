import { describe, expect, it, vi } from 'vitest'
import { primaryStall, suggestionsForStall } from './demoFixture'
import { judgeConversation, runJudgeDemo, stallCueLine } from './judgeDemo'

vi.mock('../preview/previewAssets', () => ({
  ensurePreviewImages: async () => {},
  renderPreviewOptions: () => ({}),
  previewImageUrl: () => null,
}))

describe('judgeDemo', () => {
  it('builds suggestions from the fixture stall', () => {
    const items = suggestionsForStall(primaryStall)
    expect(items[0]?.word).toBe('cup')
    expect(items.length).toBe(3)
  })

  it('describes the primary stall', () => {
    expect(stallCueLine()).toContain('cup')
  })

  it('reaches help phase with candidates preview (Step 3 auto-hint)', async () => {
    const phases: string[] = []
    let lastLabel = ''
    await runJudgeDemo(
      judgeConversation,
      {
        onState(state) {
          phases.push(state.phase)
        },
        onPreviewSvg(_svg, label) {
          lastLabel = label
        },
      },
      { speed: 0, hintTrigger: 'auto' },
    )
    expect(phases).toContain('help')
    expect(lastLabel).toContain('candidates L1')
    expect(lastLabel).toContain('after auto-hint')
    expect(lastLabel).not.toContain('cup')
  })

  it('Step 2 path labels the help tap', async () => {
    let lastLabel = ''
    await runJudgeDemo(
      judgeConversation,
      {
        onState() {},
        onPreviewSvg(_svg, label) {
          lastLabel = label
        },
      },
      { speed: 0, hintTrigger: 'tap' },
    )
    expect(lastLabel).toContain('after help tap')
  })

  it('stops when the run is aborted', async () => {
    const ac = new AbortController()
    const phases: string[] = []
    ac.abort()
    await runJudgeDemo(
      judgeConversation,
      {
        onState(state) {
          phases.push(state.phase)
        },
        onPreviewSvg() {},
      },
      { speed: 0, signal: ac.signal },
    )
    expect(phases).toContain('cancelled')
    expect(phases).not.toContain('help')
  })
})
