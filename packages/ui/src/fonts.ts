export type FontDisplay = 'auto' | 'block' | 'swap' | 'fallback' | 'optional'

export interface FontAssetMetadata {
  readonly file?: string
  readonly type?: string
  /** CSS family name; defaults to the asset id. */
  readonly family?: string
  readonly weight?: string
  readonly style?: string
  readonly display?: FontDisplay
}

export interface FontAssetEntry extends FontAssetMetadata {
  readonly id: string
}

export type FontAssetCollection =
  | Readonly<Record<string, FontAssetMetadata>>
  | readonly FontAssetEntry[]

export interface FontFaceLike {
  readonly family: string
  load(): Promise<FontFaceLike>
}

export interface FontSetLike {
  add(font: FontFaceLike): void
  delete(font: FontFaceLike): boolean
  has(font: FontFaceLike): boolean
  readonly ready?: Promise<unknown>
}

export interface FontFaceOptions {
  readonly weight?: string
  readonly style?: string
  readonly display?: FontDisplay
}

export interface FontFaceFactory {
  create(family: string, source: string, descriptors?: FontFaceOptions): FontFaceLike
}

export interface FontLoadFailure {
  readonly id: string
  readonly error: unknown
}

export interface FontLoadReport {
  readonly loaded: readonly string[]
  readonly failed: readonly FontLoadFailure[]
}

export interface FontLoaderOptions {
  readonly sourceFor?: (file: string, id: string) => string
  readonly familyFor?: (entry: FontAssetEntry) => string
}

interface FontAsset {
  readonly id: string
  readonly file: string
  readonly family: string
  readonly descriptors: FontFaceOptions
}

function entries(
  assets: FontAssetCollection,
  familyFor?: (entry: FontAssetEntry) => string,
): FontAsset[] {
  const result: FontAsset[] = []
  const ids = new Set<string>()
  const add = (id: string, asset: FontAssetMetadata): void => {
    if (asset.type !== 'font') {
      return
    }
    if (id.length === 0) {
      throw new Error('font asset id must not be empty')
    }
    if (asset.file === undefined || asset.file.length === 0) {
      throw new Error(`font asset ${id} has no file`)
    }
    if (ids.has(id)) {
      throw new Error(`font asset id is duplicated: ${id}`)
    }
    ids.add(id)
    const descriptors: FontFaceOptions = {
      ...(asset.weight === undefined ? {} : { weight: asset.weight }),
      ...(asset.style === undefined ? {} : { style: asset.style }),
      ...(asset.display === undefined ? {} : { display: asset.display }),
    }
    result.push({
      id,
      file: asset.file,
      family: familyFor?.({ id, ...asset }) ?? asset.family ?? id,
      descriptors,
    })
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

/** Loads font assets into an injectable FontFaceSet-like registry. */
export class FontLoader {
  private readonly fonts: FontSetLike
  private readonly factory: FontFaceFactory
  private readonly sourceFor: (file: string, id: string) => string
  private readonly familyFor: ((entry: FontAssetEntry) => string) | undefined

  constructor(fonts: FontSetLike, factory: FontFaceFactory, options: FontLoaderOptions = {}) {
    this.fonts = fonts
    this.factory = factory
    this.sourceFor = options.sourceFor ?? ((file) => file)
    this.familyFor = options.familyFor
  }

  async load(entry: FontAssetEntry): Promise<FontFaceLike> {
    if (entry.type !== undefined && entry.type !== 'font') {
      throw new Error(`asset ${entry.id} is not a font`)
    }
    if (entry.file === undefined || entry.file.length === 0) {
      throw new Error(`font asset ${entry.id} has no file`)
    }
    const [asset] = entries([{ ...entry, type: 'font' }], this.familyFor)
    if (asset === undefined) {
      throw new Error(`asset ${entry.id} is not a font`)
    }
    return this.loadResolved(asset)
  }

  /** Loads all `type === 'font'` assets; malformed entries throw before loading. */
  async loadAssets(assets: FontAssetCollection): Promise<FontLoadReport> {
    const fontEntries = entries(assets, this.familyFor)
    const loaded: string[] = []
    const failed: FontLoadFailure[] = []
    for (const entry of fontEntries) {
      try {
        await this.loadResolved(entry)
        loaded.push(entry.id)
      } catch (error) {
        failed.push({ id: entry.id, error })
      }
    }
    return { loaded, failed }
  }

  private async loadResolved(asset: FontAsset): Promise<FontFaceLike> {
    const face = this.factory.create(
      asset.family,
      this.sourceFor(asset.file, asset.id),
      asset.descriptors,
    )
    const loaded = await face.load()
    this.fonts.add(loaded)
    return loaded
  }
}

function browserFontSet(): FontSetLike {
  if (typeof document === 'undefined' || document.fonts === undefined) {
    throw new Error('document.fonts is unavailable')
  }
  const fonts = document.fonts
  return {
    add: (font) => {
      fonts.add(font as FontFace)
    },
    delete: (font) => fonts.delete(font as FontFace),
    has: (font) => fonts.has(font as FontFace),
    ready: fonts.ready,
  }
}

function browserFontFaceFactory(): FontFaceFactory {
  return {
    create(family, source, descriptors) {
      if (typeof FontFace === 'undefined') {
        throw new Error('FontFace is unavailable')
      }
      const options: FontFaceOptions = {
        ...(descriptors?.weight === undefined ? {} : { weight: descriptors.weight }),
        ...(descriptors?.style === undefined ? {} : { style: descriptors.style }),
        ...(descriptors?.display === undefined ? {} : { display: descriptors.display }),
      }
      return new FontFace(family, `url(${JSON.stringify(source)})`, options)
    },
  }
}

/** Browser adapter; inject `document.fonts` indirectly for testability. */
export function createBrowserFontLoader(options: FontLoaderOptions = {}): FontLoader {
  return new FontLoader(browserFontSet(), browserFontFaceFactory(), options)
}
