import { randomBytes } from 'node:crypto'
import { readdir, readFile, writeFile, mkdir, chmod } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { captureTree, git, run, readJson } from './git.mjs'
import { installedPolicy, qualityDirectory, policyManifest, manifestDigest, authenticEvidence, signEvidence } from './policy.mjs'
import { evidenceKey } from './evidence.mjs'
import { faults } from './faults.mjs'

const quote = value => `'${value.replaceAll("'", "'\\''")}'`

async function reviewedEvidence(root, tree, digest, existing, review) {
  const directory = await qualityDirectory(root)
  let files
  try { files = await readdir(join(directory, 'evidence')) } catch (error) { if (error.code === 'ENOENT') files = []; else throw error }
  for (const file of files.filter(file => file.endsWith('.json') && (!review || file.endsWith('-review.json')))) {
    const value = await readJson(join(directory, 'evidence', file))
    if (existing !== null && !authenticEvidence(value, await readFile(join(directory, 'key')))) continue
    const payload = value.payload
    if (payload?.complete && payload.tree === tree && payload.candidatePolicy === digest && payload.runtime === process.version &&
      payload.units.length > 0 && payload.browsers.length > 0 && faults.every(fault => payload.killed.includes(fault.id))) return payload
  }
  throw new Error('no matching verification evidence; run pnpm verify (or an explicitly reviewed pnpm verify --review-policy) first')
}

export async function install(root, { bootstrap = false, reviewed = false } = {}) {
  const directory = await qualityDirectory(root)
  const existing = await installedPolicy(root)
  if (existing !== null && !reviewed) {
    await git(root, ['config', '--local', 'core.hooksPath', join(directory, 'hooks')])
    console.log('quality hooks installed; the existing trusted policy and contracts were retained')
    return existing
  }
  const tree = await captureTree(root, bootstrap || reviewed ? {} : { commit: 'HEAD' })
  const manifest = await policyManifest(root, tree)
  if (manifest['tools/quality/hook.mjs'] === undefined) {
    console.log('quality tooling is not committed yet; verify the initial tree and run quality:install --bootstrap')
    return null
  }
  const digest = manifestDigest(manifest)
  const proof = bootstrap || reviewed ? await reviewedEvidence(root, tree, digest, existing, reviewed) : null
  const policyDirectory = join(directory, 'policies', digest)
  await mkdir(policyDirectory, { recursive: true })
  for (const path of Object.keys(manifest)) {
    const result = await run('git', ['-C', root, 'show', `${tree}:${path}`], { encoding: 'buffer' })
    await mkdir(dirname(join(policyDirectory, path)), { recursive: true })
    await writeFile(join(policyDirectory, path), result.stdout)
  }
  if (existing === null) {
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'key'), randomBytes(32), { mode: 0o600, flag: 'wx' })
  }
  const state = { version: 1, directory: policyDirectory, digest, manifest, baseline: tree, units: proof?.units ?? [], browsers: proof?.browsers ?? [] }
  await writeFile(join(directory, 'state.json'), `${JSON.stringify(signEvidence(state, await readFile(join(directory, 'key'))), null, 2)}\n`, { mode: 0o600 })
  await git(root, ['update-ref', 'refs/lunego/quality/baseline', tree])
  await mkdir(join(directory, 'hooks'), { recursive: true })
  for (const name of ['pre-commit', 'pre-push']) {
    const path = join(directory, 'hooks', name)
    await writeFile(path, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(join(policyDirectory, 'tools/quality/hook.mjs'))} ${quote(root)} ${quote(name)} "$@"\n`)
    await chmod(path, 0o755)
  }
  await git(root, ['config', '--local', 'core.hooksPath', join(directory, 'hooks')])
  if (bootstrap && proof !== null) {
    const context = { tree, policy: digest, baseline: tree, runtime: process.version }
    const payload = { ...proof, ...context }
    const value = signEvidence(payload, await readFile(join(directory, 'key')))
    await writeFile(join(directory, 'evidence', `${evidenceKey(context)}.json`), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  }
  console.log(`quality hooks sealed outside the working tree; policy ${digest.slice(0, 12)}, baseline ${tree.slice(0, 12)}`)
  return state
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    if (args.some(arg => !['--bootstrap', '--reviewed'].includes(arg))) throw new Error('unknown quality installation option')
    await install(process.cwd(), { bootstrap: args.includes('--bootstrap'), reviewed: args.includes('--reviewed') })
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
