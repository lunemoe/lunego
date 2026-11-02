import type { SpriteFrame } from './types.js'

export type TextureSource = string | ImageBitmap | HTMLCanvasElement | HTMLImageElement

export interface TextureLoadResult<T> {
  readonly texture: T
  readonly width: number
  readonly height: number
}

export interface TextureLoader<T> {
  load(source: TextureSource): Promise<TextureLoadResult<T>>
  dispose(texture: T): void
}

export interface TextureMetadata {
  readonly width?: number
  readonly height?: number
  readonly frames?: readonly SpriteFrame[]
}

export interface LoadedTexture<T> {
  readonly id: string
  readonly texture: T
  readonly width: number
  readonly height: number
  readonly frames?: readonly SpriteFrame[]
}

export interface TextureManifestEntry {
  readonly source: TextureSource
  readonly width?: number
  readonly height?: number
  readonly frames?: readonly SpriteFrame[]
}

export type TextureManifest = Readonly<Record<string, TextureManifestEntry>>

export interface TextureLoadFailure {
  readonly id: string
  readonly error: unknown
}

export interface TextureLoadReport {
  readonly loaded: readonly string[]
  readonly failed: readonly TextureLoadFailure[]
}

/**
 * id -> GPU texture registry. Loading is injected so the same store works with
 * Pixi, tests, or a platform-specific loader. A failed entry never prevents
 * the rest of a manifest from loading.
 */
export class TextureStore<T> {
  private readonly loader: TextureLoader<T>
  private readonly entries = new Map<string, LoadedTexture<T>>()
  private readonly failures = new Map<string, unknown>()
  private destroyed = false

  constructor(loader: TextureLoader<T>) {
    this.loader = loader
  }

  async load(id: string, source: TextureSource, metadata: TextureMetadata = {}): Promise<LoadedTexture<T>> {
    if (this.destroyed) {
      throw new Error('texture store is destroyed')
    }
    if (this.entries.has(id)) {
      throw new Error(`texture ${id} is already loaded`)
    }
    try {
      const loaded = await this.loader.load(source)
      const entry: LoadedTexture<T> = {
        id,
        texture: loaded.texture,
        width: metadata.width ?? loaded.width,
        height: metadata.height ?? loaded.height,
        ...(metadata.frames === undefined ? {} : { frames: metadata.frames }),
      }
      this.entries.set(id, entry)
      this.failures.delete(id)
      return entry
    } catch (error) {
      this.failures.set(id, error)
      throw error
    }
  }

  register(id: string, texture: T, metadata: TextureMetadata = {}): LoadedTexture<T> {
    if (this.destroyed) {
      throw new Error('texture store is destroyed')
    }
    if (this.entries.has(id)) {
      throw new Error(`texture ${id} is already loaded`)
    }
    const entry: LoadedTexture<T> = {
      id,
      texture,
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      ...(metadata.frames === undefined ? {} : { frames: metadata.frames }),
    }
    this.entries.set(id, entry)
    return entry
  }

  async registerSource(
    id: string,
    source: TextureSource,
    metadata: TextureMetadata = {},
  ): Promise<LoadedTexture<T>> {
    return this.load(id, source, metadata)
  }

  async loadManifest(manifest: TextureManifest): Promise<TextureLoadReport> {
    const loaded: string[] = []
    const failed: TextureLoadFailure[] = []
    for (const id of Object.keys(manifest)) {
      const entry = manifest[id]
      try {
        await this.load(id, entry.source, {
          ...(entry.width === undefined ? {} : { width: entry.width }),
          ...(entry.height === undefined ? {} : { height: entry.height }),
          ...(entry.frames === undefined ? {} : { frames: entry.frames }),
        })
        loaded.push(id)
      } catch (error) {
        failed.push({ id, error })
      }
    }
    return { loaded, failed }
  }

  get(id: string): LoadedTexture<T> | undefined {
    return this.entries.get(id)
  }

  has(id: string): boolean {
    return this.entries.has(id)
  }

  ids(): readonly string[] {
    return [...this.entries.keys()]
  }

  failure(id: string): unknown {
    return this.failures.get(id)
  }

  get size(): number {
    return this.entries.size
  }

  destroy(): void {
    if (this.destroyed) {
      return
    }
    for (const entry of this.entries.values()) {
      this.loader.dispose(entry.texture)
    }
    this.entries.clear()
    this.failures.clear()
    this.destroyed = true
  }
}
