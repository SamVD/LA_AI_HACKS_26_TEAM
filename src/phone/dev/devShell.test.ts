import { describe, expect, it } from 'vitest'
import { createDevShell } from './devShell'

describe('createDevShell', () => {
  it('lists modes from flags and runs step1 through onScreen', async () => {
    const { shell } = createDevShell()
    const modes = shell.modes()
    expect(modes.find(m => m.id === 'step1')?.enabled).toBe(true)
    expect(modes.find(m => m.id === 'step2')?.enabled).toBe(false)

    const seen: string[] = []
    shell.onScreen(s => seen.push(s.kind))
    await shell.startMode('step1')
    expect(shell.activeMode()).toBe('step1')

    const last = shell.lastScreen()
    if (last?.kind === 'prompt') {
      expect(last.sentence).toContain('____')
      expect(seen).toContain('prompt')
    } else {
      expect(last).toEqual({ kind: 'status', text: 'step1 not built yet' })
    }

    await shell.leaveMode()
    expect(shell.activeMode()).toBe(null)
  })
})
