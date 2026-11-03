import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git, run, captureTree, checkoutTree, restoreContracts } from './git.mjs'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'lunego-contract-test-'))
  await git(root, ['init', '--quiet', '-b', 'main'])
  await writeFile(join(root, 'runtime.mjs'), 'export const answer = () => 42\n')
  await writeFile(join(root, 'contract.test.mjs'), "import { answer } from './runtime.mjs'; import assert from 'node:assert/strict'; import { test } from 'node:test'; test('answer contract', () => assert.equal(answer(), 42))\n")
  await git(root, ['add', '.'])
  await git(root, ['-c', 'user.name=Quality Fixture', '-c', 'user.email=quality@example.invalid', 'commit', '--quiet', '-m', 'contract'])
  return root
}

test('running old contracts against new code detects a bug hidden by edited tests', async () => {
  const root = await fixture()
  const sandbox = await mkdtemp(join(tmpdir(), 'lunego-contract-sandbox-'))
  try {
    const baseline = await captureTree(root, { commit: 'HEAD' })
    await writeFile(join(root, 'runtime.mjs'), 'export const answer = () => 0\n')
    const original = await readFile(join(root, 'contract.test.mjs'), 'utf8')
    await writeFile(join(root, 'contract.test.mjs'), original.replace('answer(), 42', 'answer(), 0'))
    await checkoutTree(root, await captureTree(root), sandbox)
    await run(process.execPath, ['--test', 'contract.test.mjs'], { cwd: sandbox })
    await restoreContracts(root, baseline, sandbox)
    await assert.rejects(run(process.execPath, ['--test', 'contract.test.mjs'], { cwd: sandbox }), error => error.stdout.includes('0 !== 42'))
  } finally { await rm(root, { recursive: true, force: true }); await rm(sandbox, { recursive: true, force: true }) }
})

test('staged evidence checks the actual index rather than unstaged repairs', async () => {
  const root = await fixture()
  const sandbox = await mkdtemp(join(tmpdir(), 'lunego-index-sandbox-'))
  try {
    await writeFile(join(root, 'runtime.mjs'), 'export const answer = () => 0\n')
    await git(root, ['add', 'runtime.mjs'])
    await writeFile(join(root, 'runtime.mjs'), 'export const answer = () => 42\n')
    const staged = await captureTree(root, { staged: true })
    assert.notEqual(staged, await captureTree(root))
    await checkoutTree(root, staged, sandbox)
    await assert.rejects(run(process.execPath, ['--test', 'contract.test.mjs'], { cwd: sandbox }))
    assert.match(await readFile(join(root, 'runtime.mjs'), 'utf8'), /42/)
  } finally { await rm(root, { recursive: true, force: true }); await rm(sandbox, { recursive: true, force: true }) }
})

test('Git hook environment cannot redirect isolated checks back into the developer repository', async () => {
  const first = await fixture()
  const second = await fixture()
  const previous = process.env.GIT_DIR
  try {
    process.env.GIT_DIR = join(first, '.git')
    assert.equal(await git(second, ['rev-parse', '--show-toplevel']), second)
  } finally {
    if (previous === undefined) delete process.env.GIT_DIR
    else process.env.GIT_DIR = previous
    await rm(first, { recursive: true, force: true })
    await rm(second, { recursive: true, force: true })
  }
})
