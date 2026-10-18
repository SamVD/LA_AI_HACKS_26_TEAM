import { describe, expect, it } from 'vitest'
import { createDevShell } from './devShell'

describe('createDevShell', () => {
  it('lists modes from flags and runs step1 through onScreen', async () => {
    const { shell } = createDevShell([])
    const modes = shell.modes()
    expect(modes.find(m => m.id === 'step1')?.enabled).toBe(true)
    expect(modes.find(m => m.id === 'step2')?.enabled).toBe(false)

    const seen: string[] = []
    shell.onScreen(s => seen.push(s.kind))
    await shell.startMode('step1')
    expect(shell.activeMode()).toBe('step1')
    expect(seen.at(-1)).toBe('status')
    expect(shell.lastScreen()).toEqual({ kind: 'status', text: 'step1 not built yet' })

    await shell.leaveMode()
    expect(shell.activeMode()).toBe(null)
  })
})
