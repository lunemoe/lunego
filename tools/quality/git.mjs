import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'

const execute = promisify(execFile)

export async function run(command, args, options = {}) {
  const { env = process.env, gitIndexFile, ...rest } = options
  const childEnv = { ...env }
  delete childEnv.NODE_TEST_CONTEXT
  for (const key of Object.keys(childEnv)) if (key.startsWith('GIT_')) delete childEnv[key]
  if (gitIndexFile !== undefined) childEnv.GIT_INDEX_FILE = gitIndexFile
  return execute(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 600_000, ...rest, env: childEnv })
}

export async function git(root, args, options = {}) {
  const result = await run('git', ['-C', root, ...args], options)
  return result.stdout.trimEnd()
}

export async function gitPath(root) {
  return git(root, ['rev-parse', '--absolute-git-dir'])
}

export async function captureTree(root, { staged = false, commit } = {}) {
  if (commit !== undefined) return git(root, ['rev-parse', '--verify', `${commit}^{tree}`])
  if (staged) return git(root, ['write-tree'], process.env.GIT_INDEX_FILE === undefined ? {} : { gitIndexFile: resolve(root, process.env.GIT_INDEX_FILE) })
  const temporary = await mkdtemp(join(tmpdir(), 'lunego-index-'))
  try {
    const gitIndexFile = join(temporary, 'index')
    await git(root, ['read-tree', 'HEAD'], { gitIndexFile })
    await git(root, ['add', '--all', '--', '.'], { gitIndexFile })
    return await git(root, ['write-tree'], { gitIndexFile })
  } finally { await rm(temporary, { recursive: true, force: true }) }
}

export async function treeFiles(root, tree) {
  const output = await git(root, ['ls-tree', '-r', '-z', '--name-only', tree])
  return output.split('\0').filter(Boolean)
}

export async function checkoutTree(root, tree, destination) {
  await mkdir(destination, { recursive: true })
  const temporary = await mkdtemp(join(tmpdir(), 'lunego-checkout-index-'))
  try {
    const gitIndexFile = join(temporary, 'index')
    await git(root, ['read-tree', tree], { gitIndexFile })
    await git(root, [`--work-tree=${destination}`, 'checkout-index', '--all', '--force'], { gitIndexFile })
  } finally { await rm(temporary, { recursive: true, force: true }) }
}

export function contractPath(path) {
  return /(?:^|\/)(?:__tests__|tests|e2e)\/|\.(?:test|spec)\.[cm]?[jt]s$|(?:^|\/)(?:vitest|playwright)\.config\.[cm]?[jt]s$|\.(?:snap|golden\.json)$/.test(path)
}

export async function restoreContracts(root, tree, destination) {
  const files = (await treeFiles(root, tree)).filter(contractPath)
  for (const path of files) {
    const { stdout } = await run('git', ['-C', root, 'show', `${tree}:${path}`], { encoding: 'buffer' })
    await mkdir(dirname(join(destination, path)), { recursive: true })
    await writeFile(join(destination, path), stdout)
  }
  return files
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}
