import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generate } from './gen.js'
import { pathExists } from './project.js'

const frameworkPackages = ['core', 'host', 'input', 'render-pixi', 'ui', 'vfx', 'audio', 'cli', 'eslint-plugin'] as const

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

async function workspaceHasFramework(root: string): Promise<boolean> {
  return (
    (await pathExists(join(root, 'packages/core/package.json'))) ||
    (await pathExists(join(root, 'lunego/packages/core/package.json'))) ||
    (await pathExists(join(root, 'node_modules/@lunego/core/package.json')))
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

async function prepareExternalWorkspace(cwd: string): Promise<void> {
  const packagesRoot = frameworkPackagesRoot(import.meta.url)
  const mirrorRoot = join(cwd, '.lunego', 'packages')
  if (!(await pathExists(mirrorRoot))) {
    await mkdir(mirrorRoot, { recursive: true })
    for (const name of frameworkPackages) {
      await copyFramework(join(packagesRoot, name), join(mirrorRoot, name))
    }
  }
  const workspacePath = join(cwd, 'pnpm-workspace.yaml')
  if (!(await pathExists(workspacePath))) {
    await writeFile(
      workspacePath,
      "packages:\n  - 'games/*'\n  - '.lunego/packages/*'\n",
      'utf8',
    )
  }
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

async function copyTemplate(source: string, target: string, name: string): Promise<void> {
  const entries = await readdir(source, { withFileTypes: true })
  await mkdir(target, { recursive: true })
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') {
      continue
    }
    const from = join(source, entry.name)
    const to = join(target, entry.name)
    if (entry.isDirectory()) {
      await copyTemplate(from, to, name)
      continue
    }
    if (textExtensions[extname(entry.name)] === true) {
      const content = await readFile(from, 'utf8')
      await writeFile(to, content
        .split('__GAME_NAME__')
        .join(name)
        .split('@lunego/game-template')
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
  await copyTemplate(join(root, 'game'), target, name)
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
