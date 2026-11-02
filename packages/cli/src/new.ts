import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generate } from './gen.js'
import { pathExists } from './project.js'

export function templatesRoot(): string {
  return fileURLToPath(new URL('../../../templates', import.meta.url))
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
  const generated = await generate(target, false)
  if (generated.errors.length > 0) {
    throw new Error(generated.errors.join('\n'))
  }
  return { target, files: generated.files }
}
