import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

// ** spans complete segments (including zero); * stays inside one segment.
function matches(glob, file) {
  const pattern = glob.split('/')
  const path = file.split('/')
  const visit = (g, p) => {
    if (g === pattern.length) return p === path.length
    if (pattern[g] === '**') {
      return visit(g + 1, p) || (p < path.length && visit(g, p + 1))
    }
    if (p === path.length) return false
    const segment = pattern[g].split('*')
      .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')
    return new RegExp(`^${segment}$`).test(path[p]) && visit(g + 1, p + 1)
  }
  return visit(0, 0)
}

export function checkOwnership(owners, branch, files) {
  const slash = branch.indexOf('/')
  const prefix = branch.slice(0, slash)
  if (slash < 1 || !branch.slice(slash + 1) || !Object.hasOwn(owners.lanes, prefix)) {
    return { ok: false, violations: files.length ? [...files] : [`Unknown lane: ${branch}`] }
  }
  const allowed = [...owners.lanes[prefix].paths, ...(owners.branchGrants?.[branch] ?? [])]
  const violations = files.filter(file => !allowed.some(glob => matches(glob, file)))
  return { ok: violations.length === 0, violations }
}

function main() {
  const args = process.argv.slice(2)
  const option = name => {
    const index = args.indexOf(name)
    return index < 0 ? undefined : args[index + 1]
  }
  const branch = option('--branch')
  if (!branch) throw new Error('Usage: check-ownership.mjs --branch <lane/name> [--base <ref> | --files a,b]')
  const root = fileURLToPath(new URL('../', import.meta.url))
  const owners = JSON.parse(readFileSync(resolve(root, 'OWNERS.json'), 'utf8'))
  const explicit = option('--files')
  const files = explicit !== undefined ? explicit.split(',').filter(Boolean) :
    execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', `${option('--base') ?? 'origin/integration'}...HEAD`], {
      cwd: root, encoding: 'utf8',
    }).split('\0').filter(Boolean)
  const result = checkOwnership(owners, branch, files)
  if (!result.ok) {
    console.error(`Ownership check failed for ${branch}:`)
    for (const file of result.violations) console.error(`  ${file}`)
    process.exitCode = 1
  } else {
    console.log(`Ownership check passed for ${branch} (${files.length} files)`)
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { main() } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
