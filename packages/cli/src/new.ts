import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generate } from './gen.js'
import { pathExists } from './project.js'

const frameworkPackages = [
  'core',
  'host',
  'input',
  'render-pixi',
  'ui',
  'vfx',
  'audio',
  'i18n',
  'testkit',
  'cli',
  'eslint-plugin',
] as const

const workspaceEntries = ['games/*', '.lunego/packages/*', '.lunego/kits/*'] as const

function frameworkPackagesRoot(moduleUrl: string): string {
  return fileURLToPath(new URL('../../', moduleUrl))
}

async function findWorkspaceRoot(start: string): Promise<string | null> {
  let current = resolve(start)
  while (true) {
    if (await pathExists(join(current, 'pnpm-workspace.yaml'))) {
      return current
    }
    const parent = dirname(current)
    if (parent === current) {
      return null
    }
    current = parent
  }
}

async function hasPackageJson(path: string): Promise<boolean> {
  return pathExists(join(path, 'package.json'))
}

async function hasKitDirectories(root: string, prefix?: string): Promise<boolean> {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        (prefix === undefined || entry.name.startsWith(prefix)) &&
        (await hasPackageJson(join(root, entry.name)))
      ) {
        return true
      }
    }
  } catch {
    return false
  }
  return false
}

async function workspaceHasFramework(root: string): Promise<boolean> {
  for (const path of [
    join(root, 'packages/core/package.json'),
    join(root, 'lunego/packages/core/package.json'),
    join(root, '.lunego/packages/core/package.json'),
    join(root, 'node_modules/@lunego/core/package.json'),
  ]) {
    if (await pathExists(path)) {
      return true
    }
  }
  return (
    (await hasKitDirectories(join(root, 'kits'))) ||
    (await hasKitDirectories(join(root, '.lunego/kits'))) ||
    (await hasKitDirectories(join(root, 'node_modules/@lunego'), 'kit-'))
  )
}

async function copyFramework(source: string, target: string): Promise<void> {
  await cp(source, target, {
    recursive: true,
    filter: (path) => {
      const name = path.slice(path.lastIndexOf('/') + 1)
      return name !== 'node_modules' && name !== '.vite' && name !== '.vite-temp'
    },
  })
}

async function findPackageSource(packagesRoot: string, name: string): Promise<string | null> {
  const candidates = [join(packagesRoot, name), join(packagesRoot, '@lunego', name)]
  if (name === 'cli') {
    candidates.push(join(packagesRoot, 'lunego'))
  }
  for (const candidate of candidates) {
    if (await hasPackageJson(candidate)) {
      return candidate
    }
  }
  return null
}

async function findKitsRoot(packagesRoot: string): Promise<string | null> {
  const sibling = join(packagesRoot, '..', 'kits')
  if (await hasKitDirectories(sibling)) {
    return sibling
  }
  const scoped = join(packagesRoot, '@lunego')
  if (await hasKitDirectories(scoped, 'kit-')) {
    return scoped
  }
  return null
}

async function copyKits(sourceRoot: string, targetRoot: string): Promise<void> {
  await mkdir(targetRoot, { recursive: true })
  const entries = await readdir(sourceRoot, { withFileTypes: true })
  for (const entry of entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
    if (!entry.isDirectory()) {
      continue
    }
    const source = join(sourceRoot, entry.name)
    if (!(await hasPackageJson(source))) {
      continue
    }
    await copyFramework(source, join(targetRoot, entry.name))
  }
}

function workspaceTemplate(): string {
  return `packages:\n${workspaceEntries.map((entry) => `  - '${entry}'`).join('\n')}\n`
}

async function ensureWorkspaceConfig(cwd: string): Promise<void> {
  const path = join(cwd, 'pnpm-workspace.yaml')
  if (!(await pathExists(path))) {
    await writeFile(path, workspaceTemplate(), 'utf8')
    return
  }
  const text = await readFile(path, 'utf8')
  const missing = workspaceEntries.filter((entry) => !text.includes(entry))
  if (missing.length === 0) {
    return
  }
  const lines = text.split(/\r?\n/)
  const packagesLine = lines.findIndex((line) => /^packages:\s*$/.test(line))
  if (packagesLine === -1) {
    await writeFile(path, `${workspaceTemplate()}${text}`, 'utf8')
    return
  }
  lines.splice(
    packagesLine + 1,
    0,
    ...missing.map((entry) => `  - '${entry}'`),
  )
  const next = lines.join('\n')
  await writeFile(path, next.endsWith('\n') ? next : `${next}\n`, 'utf8')
}

async function prepareExternalWorkspace(cwd: string): Promise<void> {
  const packagesRoot = frameworkPackagesRoot(import.meta.url)
  const mirrorRoot = join(cwd, '.lunego', 'packages')
  const kitsRoot = join(cwd, '.lunego', 'kits')
  await mkdir(mirrorRoot, { recursive: true })
  await mkdir(kitsRoot, { recursive: true })
  for (const name of frameworkPackages) {
    const source = await findPackageSource(packagesRoot, name)
    if (source === null) {
      throw new Error(`framework package ${name} was not found under ${packagesRoot}`)
    }
    await copyFramework(source, join(mirrorRoot, name))
  }
  const sourceKits = await findKitsRoot(packagesRoot)
  if (sourceKits === null) {
    throw new Error(`framework kits were not found next to ${packagesRoot}`)
  }
  await copyKits(sourceKits, kitsRoot)
  await ensureWorkspaceConfig(cwd)
}

export function templatesRoot(moduleUrl: string = import.meta.url): string {
  const packageRoot = fileURLToPath(new URL('..', moduleUrl))
  const packaged = join(packageRoot, 'templates')
  if (existsSync(packaged)) {
    return packaged
  }
  // Source checkout before the build has copied templates into the package.
  return join(packageRoot, '..', '..', 'templates')
}

const textExtensions: Readonly<Record<string, true>> = {
  '.ts': true,
  '.json': true,
  '.md': true,
  '.html': true,
  '.css': true,
  '.txt': true,
  '.yml': true,
  '.yaml': true,
}

async function copyTemplate(source: string, target: string, name: string, sourcePackage: string): Promise<void> {
  const entries = await readdir(source, { withFileTypes: true })
  await mkdir(target, { recursive: true })
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') {
      continue
    }
    const from = join(source, entry.name)
    const to = join(target, entry.name)
    if (entry.isDirectory()) {
      await copyTemplate(from, to, name, sourcePackage)
      continue
    }
    if (textExtensions[extname(entry.name)] === true) {
      const content = await readFile(from, 'utf8')
      if (entry.name === 'package.json') {
        const packageInfo: Record<string, unknown> = JSON.parse(content)
        packageInfo['name'] = `@lunego/game-${name}`
        await writeFile(to, `${JSON.stringify(packageInfo, null, 2)}\n`, 'utf8')
        continue
      }
      await writeFile(to, content
        .split(sourcePackage)
        .join(`@lunego/game-${name}`), 'utf8')
    } else {
      await cp(from, to)
    }
  }
}

export interface NewGameResult {
  readonly target: string
  readonly files: readonly string[]
}

export async function newGame(cwd: string, name: string): Promise<NewGameResult> {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error('game name must match [a-z][a-z0-9-]*')
  }
  const target = join(cwd, 'games', name)
  if (await pathExists(target)) {
    throw new Error(`target already exists: ${target}`)
  }
  const root = templatesRoot()
  if (!(await pathExists(join(root, 'game')))) {
    throw new Error(`game template not found at ${join(root, 'game')}`)
  }
  const packageInfo: { name: string } = JSON.parse(await readFile(join(root, 'game', 'package.json'), 'utf8'))
  await copyTemplate(join(root, 'game'), target, name, packageInfo.name)
  const workspaceRoot = await findWorkspaceRoot(cwd)
  if (workspaceRoot === null || !(await workspaceHasFramework(workspaceRoot))) {
    await prepareExternalWorkspace(cwd)
  }
  const generated = await generate(target, false)
  if (generated.errors.length > 0) {
    throw new Error(generated.errors.join('\n'))
  }
  return { target, files: generated.files }
}
