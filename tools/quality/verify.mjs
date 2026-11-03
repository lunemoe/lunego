import { mkdtemp, mkdir, rm, writeFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { captureTree, checkoutTree, git, restoreContracts, contractPath, treeFiles } from './git.mjs'
import { installedPolicy, policyManifest, manifestDigest, changedPolicy, qualityDirectory, loadEvidence, saveEvidence } from './policy.mjs'
import { evidenceKey, compareResults, readNodeResults } from './evidence.mjs'
import { checkStructure } from './check.mjs'
import { step, unitSuite, browserSuite, mutationSuite } from './suites.mjs'

export async function verify(root, options = {}) {
  const tree = await captureTree(root, options)
  const state = await installedPolicy(root)
  const manifest = await policyManifest(root, tree)
  const candidatePolicy = manifestDigest(manifest)
  const drift = state === null ? [] : changedPolicy(state.manifest, manifest)
  if (drift.length > 0 && !options.reviewPolicy) {
    throw new Error(`protected quality policy changed:\n${drift.join('\n')}\nMaintainer review is required; ordinary verification cannot accept weaker rules.`)
  }
  const context = {
    tree, policy: state?.digest ?? candidatePolicy,
    baseline: state?.baseline ?? await git(root, ['rev-parse', 'HEAD^{tree}']), runtime: process.version,
  }
  const id = evidenceKey(context) + (options.reviewPolicy ? '-review' : '')
  const cached = await loadEvidence(root, id, state !== null)
  if (cached !== null && cached.candidatePolicy === candidatePolicy && cached.complete === true) {
    console.log(`verify: exact tree ${tree.slice(0, 12)} already has authenticated passing evidence`)
    return { id, evidence: cached }
  }
  const directory = await qualityDirectory(root)
  await mkdir(join(directory, 'runs'), { recursive: true })
  const output = await mkdtemp(join(directory, 'runs', `${id.slice(0, 12)}-`))
  const sandbox = await mkdtemp(join(tmpdir(), 'lunego-verified-tree-'))
  const log = join(output, 'verification.log')
  await writeFile(log, `tree ${tree}\npolicy ${context.policy}\nbaseline ${context.baseline}\n`)
  console.log(`verify: isolated tree ${tree.slice(0, 12)}; reports ${output}`)
  try {
    await checkoutTree(root, tree, sandbox)
    await step(sandbox, log, 'install isolated dependencies', 'pnpm', ['install', '--offline', '--frozen-lockfile', '--ignore-scripts'])
    const issues = await checkStructure(sandbox)
    if (issues.length !== 0) throw new Error(issues.map(issue => `${issue.path}:${issue.line} ${issue.rule}: ${issue.detail}`).join('\n'))
    const selfTests = (await readdir(join(sandbox, 'tools/quality'))).filter(file => file.endsWith('.test.mjs'))
      .map(file => join(sandbox, 'tools/quality', file))
    if (selfTests.length === 0) throw new Error('quality self-tests disappeared')
    readNodeResults((await step(sandbox, log, 'quality gate negative tests', process.execPath, ['--test', '--test-reporter=tap', ...selfTests])).stdout)
    for (const script of ['build', 'typecheck', 'lint', 'depcruise', 'gen:check']) {
      await step(sandbox, log, script, 'pnpm', ['run', script])
    }
    const units = await unitSuite(sandbox, output, 'candidate', log)
    const browsers = await browserSuite(sandbox, output, 'candidate', log)
    if (state !== null) {
      const missing = [...compareResults(state.units, units), ...compareResults(state.browsers, browsers)]
      if (missing.length > 0) throw new Error(missing.join('\n'))
    }
    const baselineFiles = new Set(await treeFiles(root, context.baseline))
    const changed = (await git(root, ['diff', '--name-only', context.baseline, tree, '--'])).split('\n')
    if (state === null || changed.some(path => baselineFiles.has(path) && contractPath(path))) {
      console.log('verify: restore previous contracts onto candidate implementation')
      const contracts = await restoreContracts(root, context.baseline, sandbox)
      const oldSelfTests = contracts.filter(path => path.startsWith('tools/quality/') && path.endsWith('.test.mjs')).map(path => join(sandbox, path))
      if (oldSelfTests.length > 0) readNodeResults((await step(sandbox, log, 'protected quality gate tests', process.execPath, ['--test', '--test-reporter=tap', ...oldSelfTests])).stdout)
      const baselineUnits = await unitSuite(sandbox, output, 'protected', log, contracts.filter(path => path.endsWith('.test.ts')))
      const baselineBrowsers = await browserSuite(sandbox, output, 'protected', log)
      const missing = [...compareResults(baselineUnits, units), ...compareResults(baselineBrowsers, browsers)]
      if (missing.length > 0) throw new Error(missing.join('\n'))
    }
    const killed = await mutationSuite(sandbox, output, log)
    const evidence = { ...context, candidatePolicy, units, browsers, killed, complete: true, reports: output, checkedAt: new Date().toISOString() }
    await saveEvidence(root, id, evidence, state !== null)
    console.log(`verify: passed ${units.length} unit contracts, ${browsers.length} browser contracts, ${killed.length}/${killed.length} injected faults`)
    return { id, evidence }
  } finally { await rm(sandbox, { recursive: true, force: true }) }
}

export function argumentsFor(args) {
  const options = {}
  let root = process.cwd()
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (value === '--root' && args[index + 1] !== undefined) root = resolve(args[++index])
    else if (value === '--commit' && args[index + 1] !== undefined) options.commit = args[++index]
    else if (value === '--staged') options.staged = true
    else if (value === '--review-policy') options.reviewPolicy = true
    else throw new Error(`unknown verification argument ${value}`)
  }
  if (options.staged && options.commit !== undefined) throw new Error('choose staged changes or a commit')
  return { root, options }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { root, options } = argumentsFor(process.argv.slice(2))
    const state = await installedPolicy(root)
    const trusted = state === null ? null : join(state.directory, 'tools/quality/verify.mjs')
    if (trusted !== null && resolve(trusted) !== fileURLToPath(import.meta.url)) {
      process.exitCode = await new Promise((resolveExit, reject) => {
        const child = spawn(process.execPath, [trusted, ...process.argv.slice(2)], { stdio: 'inherit', cwd: root })
        child.on('error', reject)
        child.on('exit', (code, signal) => resolveExit(signal === null ? code ?? 1 : 1))
      })
    } else await verify(root, options)
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
