import { createHash } from 'node:crypto'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

export interface SchemaLock {
  readonly schemaVersion: number
  readonly digest: string
}

export function toPosix(path: string): string {
  return path.split('\\').join('/')
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export async function walkFiles(root: string, skip: readonly string[] = []): Promise<string[]> {
  const result: string[] = []
  const visit = async (dir: string): Promise<void> => {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const full = join(dir, entry.name)
      const relativePath = toPosix(relative(root, full))
      if (skip.some((part) => relativePath === part || relativePath.startsWith(`${part}/`))) {
        continue
      }
      if (entry.isDirectory()) {
        await visit(full)
      } else if (entry.isFile()) {
        result.push(full)
      }
    }
  }
  await visit(root)
  return result
}

export async function featureDirs(cwd: string): Promise<string[]> {
  const featuresRoot = join(cwd, 'features')
  try {
    const entries = await readdir(featuresRoot, { withFileTypes: true })
    const dirs: string[] = []
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isDirectory()) {
        continue
      }
      const dir = join(featuresRoot, entry.name)
      if (await pathExists(join(dir, 'schema.ts'))) {
        dirs.push(dir)
      }
    }
    return dirs
  } catch {
    return []
  }
}

export async function readSchemaVersion(cwd: string): Promise<number> {
  const path = join(cwd, 'lunego.config.ts')
  try {
    const text = await readFile(path, 'utf8')
    const match = /schemaVersion\s*:\s*(\d+)/.exec(text)
    if (match === null) {
      throw new Error('lunego.config.ts is missing schemaVersion')
    }
    return Number(match[1])
  } catch (error) {
    if (error instanceof Error && error.message.includes('missing schemaVersion')) {
      throw error
    }
    throw new Error('lunego.config.ts is missing or unreadable', {
      cause: error,
    })
  }
}

export async function schemaDigest(cwd: string): Promise<string> {
  const files = await walkFiles(join(cwd, 'features'), ['_generated'])
  const relevant = files
    .filter((file) => toPosix(file).endsWith('/schema.ts') || toPosix(file).includes('/content/'))
    .sort()
  const hash = createHash('sha256')
  for (const file of relevant) {
    const relativePath = toPosix(relative(cwd, file))
    hash.update(relativePath)
    hash.update('\0')
    hash.update(await readFile(file))
    hash.update('\0')
  }
  return hash.digest('hex')
}

export async function readSchemaLock(cwd: string): Promise<SchemaLock | null> {
  try {
    const parsed = JSON.parse(await readFile(join(cwd, 'schema.lock.json'), 'utf8')) as unknown
    if (typeof parsed !== 'object' || parsed === null) {
      return null
    }
    const candidate = parsed as { schemaVersion?: unknown; digest?: unknown }
    if (
      typeof candidate.schemaVersion !== 'number' ||
      !Number.isInteger(candidate.schemaVersion) ||
      typeof candidate.digest !== 'string'
    ) {
      return null
    }
    return { schemaVersion: candidate.schemaVersion, digest: candidate.digest }
  } catch {
    return null
  }
}

export async function writeSchemaLock(cwd: string, lock: SchemaLock): Promise<void> {
  await writeFile(
    join(cwd, 'schema.lock.json'),
    `${JSON.stringify(lock, null, 2)}\n`,
    'utf8',
  )
}
