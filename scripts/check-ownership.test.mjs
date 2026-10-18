import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { checkOwnership } from './check-ownership.mjs'

const owners = JSON.parse(readFileSync(new URL('../OWNERS.json', import.meta.url), 'utf8'))
describe('ownership', () => {
  it.each([
    ['ui/x', 'src/glasses/a.ts', false],
    ['ui/x', 'src/phone/a.ts', true],
    ['logic/foundation', 'src/main.ts', true],
    ['logic/other', 'src/main.ts', false],
    ['copilot/x', 'src/phone/a.ts', false],
    ['orch/x', 'docs/design/a.md', true],
    ['logic/foundation-extra', 'src/main.ts', false],
    ['ui/x', 'src/phone-other/a.ts', false],
    ['orch/x', 'vite.configXts', false],
    ['orch/x', 'vite.config.ts', true],
  ])('%s changing %s => %s', (branch, path, ok) => {
    expect(checkOwnership(owners, branch, [path]).ok).toBe(ok)
  })
  it('supports ** at zero and multiple depths; * cannot cross a slash', () => {
    const custom = { lanes: { test: { paths: ['a/**/b.*', 'file[1].ts'] } } }
    expect(checkOwnership(custom, 'test/x', ['a/b.ts', 'a/c/d/b.ts', 'file[1].ts']).ok).toBe(true)
    expect(checkOwnership(custom, 'test/x', ['a/b.ts/x']).ok).toBe(false)
    expect(checkOwnership(custom, 'test/x', ['file1.ts']).ok).toBe(false)
  })
  it('rejects unknown lanes even with no changed files', () => {
    expect(checkOwnership(owners, 'unknown/x', []).ok).toBe(false)
    expect(checkOwnership(owners, 'logic', []).ok).toBe(false)
    expect(checkOwnership(owners, 'logic/', []).ok).toBe(false)
  })
  it('prints violations and exits nonzero in CLI mode', () => {
    const script = fileURLToPath(new URL('./check-ownership.mjs', import.meta.url))
    const fail = spawnSync(process.execPath, [script, '--branch', 'ui/x', '--files', 'src/glasses/a.ts'], { encoding: 'utf8' })
    expect(fail.status).toBe(1)
    expect(fail.stderr).toContain('src/glasses/a.ts')
    const pass = spawnSync(process.execPath, [script, '--branch', 'logic/foundation', '--files', 'src/main.ts'], { encoding: 'utf8' })
    expect(pass.status).toBe(0)
  })
})
