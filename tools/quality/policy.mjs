import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { git, treeFiles, gitPath, readJson } from './git.mjs'

export function policyFile(path) {
  return path.startsWith('tools/quality/') || path === 'eslint.config.js' || path === '.dependency-cruiser.cjs' ||
    path === 'pnpm-workspace.yaml' || path.endsWith('/package.json') || path === 'package.json' ||
    /(?:^|\/)(?:tsconfig[^/]*\.json|vitest\.config\.ts|playwright\.config\.ts)$/.test(path) ||
    path === 'e2e/vite.config.ts' ||
    (path.startsWith('packages/eslint-plugin/src/') && !path.endsWith('.test.ts')) ||
    /^packages\/cli\/src\/(?:check|gen|project|content-scan|assets-validate)\.ts$/.test(path)
}

function policyText(path, text) {
  if (path.endsWith('package.json')) {
    const data = JSON.parse(text)
    return JSON.stringify({ scripts: data.scripts ?? {}, exports: data.exports ?? {}, bin: data.bin ?? {} })
  }
  return text
}

export async function policyManifest(root, tree) {
  const result = {}
  for (const path of (await treeFiles(root, tree)).filter(policyFile).sort()) {
    const text = await git(root, ['show', `${tree}:${path}`])
    result[path] = createHash('sha256').update(policyText(path, text)).digest('hex')
  }
  return result
}

export function manifestDigest(manifest) {
  return createHash('sha256').update(JSON.stringify(Object.entries(manifest).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))).digest('hex')
}

export function changedPolicy(expected, current) {
  return [...new Set([...Object.keys(expected), ...Object.keys(current)])].sort().filter(path => expected[path] !== current[path])
}

export async function qualityDirectory(root) {
  return join(await gitPath(root), 'lunego-quality')
}

export async function installedPolicy(root) {
  try {
    const directory = await qualityDirectory(root)
    const value = await readJson(join(directory, 'state.json'))
    if (!authenticEvidence(value, await readFile(join(directory, 'key')))) throw new Error('installed quality policy metadata was modified')
    return { ...value.payload, directory: join(directory, 'policies', value.payload.digest) }
  }
  catch (error) { if (error.code === 'ENOENT') return null; throw error }
}

export function signEvidence(payload, key) {
  return { payload, signature: createHmac('sha256', key).update(JSON.stringify(payload)).digest('hex') }
}

export function authenticEvidence(value, key) {
  if (value === null || typeof value !== 'object' || typeof value.signature !== 'string' || value.payload === undefined) return false
  const expected = Buffer.from(signEvidence(value.payload, key).signature, 'hex')
  const received = Buffer.from(value.signature, 'hex')
  return expected.length === received.length && timingSafeEqual(expected, received)
}

export async function saveEvidence(root, id, payload, trusted) {
  const directory = await qualityDirectory(root)
  await mkdir(join(directory, 'evidence'), { recursive: true })
  const value = trusted ? signEvidence(payload, await readFile(join(directory, 'key'))) : { payload }
  await writeFile(join(directory, 'evidence', `${id}.json`), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
}

export async function loadEvidence(root, id, trusted) {
  const directory = await qualityDirectory(root)
  let value
  try { value = await readJson(join(directory, 'evidence', `${id}.json`)) }
  catch (error) { if (error.code === 'ENOENT') return null; throw error }
  if (trusted && !authenticEvidence(value, await readFile(join(directory, 'key')))) throw new Error('verification evidence was modified or belongs to another checkout')
  return value.payload
}
