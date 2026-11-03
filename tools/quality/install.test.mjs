import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git } from './git.mjs'
import { install } from './install.mjs'
import { verify } from './verify.mjs'

test('installation pins committed policy outside the worktree and cannot silently reapprove edits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lunego-hook-install-'))
  try {
    await git(root, ['init', '--quiet', '-b', 'main'])
    await mkdir(join(root, 'tools/quality'), { recursive: true })
    await writeFile(join(root, 'tools/quality/hook.mjs'), 'export const generation = 1\n')
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'quality-fixture', private: true }))
    await git(root, ['add', '.'])
    await git(root, ['-c', 'user.name=Quality Fixture', '-c', 'user.email=quality@example.invalid', 'commit', '--quiet', '-m', 'reviewed policy'])
    const original = await install(root)
    assert.equal(await git(root, ['cat-file', '-t', 'refs/lunego/quality/baseline']), 'tree')
    const hook = join(await git(root, ['config', '--local', '--get', 'core.hooksPath']), 'pre-commit')
    assert.ok(hook.startsWith(join(root, '.git/')))
    assert.match(await readFile(hook, 'utf8'), new RegExp(original.digest))
    await writeFile(join(root, 'tools/quality/hook.mjs'), 'export const generation = 0\n')
    const retained = await install(root)
    assert.equal(retained.digest, original.digest)
    assert.match(await readFile(join(retained.directory, 'tools/quality/hook.mjs'), 'utf8'), /generation = 1/)
    await assert.rejects(verify(root), /protected quality policy changed/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
