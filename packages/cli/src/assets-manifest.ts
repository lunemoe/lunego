import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isRecord, type AssetManifest } from './assets-schema.js'
import { pathExists } from './project.js'

export interface ManifestRead {
  readonly manifest?: AssetManifest
  readonly text?: string
  readonly errors: readonly string[]
}

export async function readAssetManifest(cwd: string): Promise<ManifestRead> {
  const path = join(cwd, 'assets', 'manifest.json')
  if (!(await pathExists(path))) {
    return { errors: [] }
  }
  const text = await readFile(path, 'utf8')
  try {
    const parsed = JSON.parse(text) as unknown
    if (!isRecord(parsed)) {
      return { text, errors: ['LG009 assets/manifest.json must contain an object'] }
    }
    return { manifest: parsed as AssetManifest, text, errors: [] }
  } catch (error) {
    return {
      text,
      errors: [
        `LG009 assets/manifest.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      ],
    }
  }
}
