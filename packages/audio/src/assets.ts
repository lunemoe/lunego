import type { SoundBank, SoundManifest, SoundManifestEntry } from './sounds.js'
import type { SoundLoadReport } from './types.js'

export interface AudioAssetMetadata {
  readonly file?: string
  readonly type?: string
}

export interface AudioAssetEntry extends AudioAssetMetadata {
  readonly id: string
}

export type AudioAssetCollection =
  | Readonly<Record<string, AudioAssetMetadata>>
  | readonly AudioAssetEntry[]

export type AudioSourceFor = (file: string, id: string) => string | ArrayBuffer

interface AudioAsset {
  readonly id: string
  readonly file: string
}

function entries(assets: AudioAssetCollection): AudioAsset[] {
  const result: AudioAsset[] = []
  const ids = new Set<string>()
  const add = (id: string, asset: AudioAssetMetadata): void => {
    if (asset.type !== 'audio') {
      return
    }
    if (id.length === 0) {
      throw new Error('audio asset id must not be empty')
    }
    if (asset.file === undefined || asset.file.length === 0) {
      throw new Error(`audio asset ${id} has no file`)
    }
    if (ids.has(id)) {
      throw new Error(`audio asset id is duplicated: ${id}`)
    }
    ids.add(id)
    result.push({ id, file: asset.file })
  }
  if (Array.isArray(assets)) {
    for (const asset of assets) {
      add(asset.id, asset)
    }
  } else {
    for (const [id, asset] of Object.entries(assets)) {
      add(id, asset)
    }
  }
  return result
}

/** Builds a `SoundBank` manifest from generated assets (`type === 'audio'`). */
export function soundManifestFromAssets(
  assets: AudioAssetCollection,
  sourceFor: AudioSourceFor = (file) => file,
): SoundManifest {
  const manifest: Record<string, SoundManifestEntry> = {}
  for (const entry of entries(assets)) {
    manifest[entry.id] = { source: sourceFor(entry.file, entry.id) }
  }
  return manifest
}

/**
 * Registers all audio assets into an existing bank. Malformed assets and ids
 * already present in the bank fail before any load starts; loader failures are
 * returned in the standard report.
 */
export async function registerAssetSounds(
  bank: SoundBank,
  assets: AudioAssetCollection,
  sourceFor: AudioSourceFor = (file) => file,
): Promise<SoundLoadReport> {
  const assetEntries = entries(assets)
  for (const entry of assetEntries) {
    if (bank.has(entry.id)) {
      throw new Error(`sound ${entry.id} is already registered`)
    }
  }
  const manifest: Record<string, SoundManifestEntry> = {}
  for (const entry of assetEntries) {
    manifest[entry.id] = { source: sourceFor(entry.file, entry.id) }
  }
  return bank.loadManifest(manifest)
}
