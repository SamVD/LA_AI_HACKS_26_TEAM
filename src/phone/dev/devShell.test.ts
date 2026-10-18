import { describe, expect, it } from 'vitest'
import { createDevShell } from './devShell'

describe('createDevShell', () => {
  it('lists modes from flags and runs step1 through onScreen', async () => {
    const { shell } = createDevShell()
    const modes = shell.modes()
    expect(modes.find(m => m.id === 'step1')?.enabled).toBe(true)
    expect(modes.find(m => m.id === 'step2')?.enabled).toBe(true)

    const seen: string[] = []
    shell.onScreen(s => seen.push(s.kind))
    await shell.startMode('step1')
    expect(shell.activeMode()).toBe('step1')

    const last = shell.lastScreen()
    expect(last?.kind).toBe('prompt')
    expect(last && 'sentence' in last && last.sentence).toContain('____')
    expect(seen).toContain('prompt')

    await shell.leaveMode()
    expect(shell.activeMode()).toBe(null)

    await shell.startMode('step2')
    expect(shell.activeMode()).toBe('step2')
    expect(shell.lastScreen()?.kind).toBe('blank')
    await shell.leaveMode()
  })
})
