import type { AudioBufferLike, LoadedSound, SoundLoadReport, SoundLoader } from './types.js'

export interface SoundManifestEntry {
  readonly source: string | ArrayBuffer
}

export type SoundManifest = Readonly<Record<string, SoundManifestEntry>>

/** Id -> decoded audio buffer registry with per-entry failure isolation. */
export class SoundBank {
  private readonly loader: SoundLoader
  private readonly entries = new Map<string, LoadedSound>()
  private readonly failures = new Map<string, unknown>()
  private destroyed = false

  constructor(loader: SoundLoader) {
    this.loader = loader
  }

  async load(id: string, source: string | ArrayBuffer): Promise<LoadedSound> {
    if (this.destroyed) {
      throw new Error('sound bank is destroyed')
    }
    if (this.entries.has(id)) {
      throw new Error(`sound ${id} is already loaded`)
    }
    try {
      const buffer = await this.loader.load(source)
      const entry: LoadedSound = { id, buffer }
      this.entries.set(id, entry)
      this.failures.delete(id)
      return entry
    } catch (error) {
      this.failures.set(id, error)
      throw error
    }
  }

  register(id: string, buffer: AudioBufferLike): LoadedSound {
    if (this.destroyed) {
      throw new Error('sound bank is destroyed')
    }
    if (this.entries.has(id)) {
      throw new Error(`sound ${id} is already loaded`)
    }
    const entry: LoadedSound = { id, buffer }
    this.entries.set(id, entry)
    return entry
  }

  async loadManifest(manifest: SoundManifest): Promise<SoundLoadReport> {
    const loaded: string[] = []
    const failed: Array<{ id: string; error: unknown }> = []
    for (const id of Object.keys(manifest)) {
      try {
        await this.load(id, manifest[id].source)
        loaded.push(id)
      } catch (error) {
        failed.push({ id, error })
      }
    }
    return { loaded, failed }
  }

  get(id: string): LoadedSound | undefined {
    return this.entries.get(id)
  }

  has(id: string): boolean {
    return this.entries.has(id)
  }

  failure(id: string): unknown {
    return this.failures.get(id)
  }

  get size(): number {
    return this.entries.size
  }

  destroy(): void {
    this.entries.clear()
    this.failures.clear()
    this.destroyed = true
  }
}
