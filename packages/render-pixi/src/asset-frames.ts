import type { TextureManifest, TextureManifestEntry, TextureSource } from './textures.js'
import { sheetFrames, type SpriteFrame } from './types.js'

export interface AssetFrameRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface AssetAnchorPoint {
  readonly x: number
  readonly y: number
}

export type AssetAnchor = string | AssetAnchorPoint

/** Metadata emitted by `lunego gen` in `features/_generated/assets.ts`. */
export interface AssetMetadata {
  readonly file?: string
  readonly type?: string
  readonly frameWidth?: number
  readonly frameHeight?: number
  readonly columns?: number
  readonly rows?: number
  readonly frames?: number | readonly AssetFrameRect[]
  readonly margin?: number
  readonly spacing?: number
  readonly fps?: number | null
  readonly anchor?: AssetAnchor
  readonly animations?: readonly AssetAnimationSpec[]
}

export interface AssetAnimationSpec {
  readonly name: string
  readonly columns?: readonly number[]
  readonly frames?: number
  readonly from?: number
  readonly fps?: number | null
  readonly loop?: boolean
  /** Per-frame milliseconds, as emitted by the Aseprite importer. */
  readonly durations?: readonly number[]
}

export interface AssetDimensions {
  readonly width?: number
  readonly height?: number
}

export interface AnimationFrameOptions extends AssetDimensions {
  /** Zero-based directional row; animation indices remain relative to that row. */
  readonly row?: number
}

const ANCHOR_POINTS: Readonly<Record<string, AssetAnchorPoint>> = {
  'top-left': { x: 0, y: 0 },
  top: { x: 0.5, y: 0 },
  'top-center': { x: 0.5, y: 0 },
  'top-right': { x: 1, y: 0 },
  left: { x: 0, y: 0.5 },
  center: { x: 0.5, y: 0.5 },
  'center-left': { x: 0, y: 0.5 },
  'center-right': { x: 1, y: 0.5 },
  right: { x: 1, y: 0.5 },
  'bottom-left': { x: 0, y: 1 },
  bottom: { x: 0.5, y: 1 },
  'bottom-center': { x: 0.5, y: 1 },
  'bottom-right': { x: 1, y: 1 },
  feet: { x: 0.5, y: 1 },
}

export function assetAnchor(anchor: AssetAnchor | undefined): AssetAnchorPoint | undefined {
  if (anchor === undefined) {
    return undefined
  }
  if (typeof anchor === 'string') {
    return ANCHOR_POINTS[anchor]
  }
  if (
    typeof anchor.x === 'number' &&
    typeof anchor.y === 'number' &&
    Number.isFinite(anchor.x) &&
    Number.isFinite(anchor.y) &&
    anchor.x >= 0 &&
    anchor.x <= 1 &&
    anchor.y >= 0 &&
    anchor.y <= 1
  ) {
    return { x: anchor.x, y: anchor.y }
  }
  return undefined
}

function checkBounds(frame: SpriteFrame, dimensions: AssetDimensions | undefined): void {
  if (!Number.isInteger(frame.x) || !Number.isInteger(frame.y)) {
    throw new Error(`asset frame origin must be integers: ${frame.x},${frame.y}`)
  }
  if (
    !Number.isInteger(frame.width) ||
    !Number.isInteger(frame.height) ||
    frame.width <= 0 ||
    frame.height <= 0
  ) {
    throw new Error(`asset frame size must be positive integers: ${frame.width}x${frame.height}`)
  }
  if (frame.x < 0 || frame.y < 0) {
    throw new Error(`asset frame origin must be non-negative: ${frame.x},${frame.y}`)
  }
  if (
    dimensions?.width !== undefined &&
    dimensions.height !== undefined &&
    (frame.x + frame.width > dimensions.width || frame.y + frame.height > dimensions.height)
  ) {
    throw new Error(
      `asset frame [${frame.x},${frame.y},${frame.width},${frame.height}] exceeds ${dimensions.width}x${dimensions.height}`,
    )
  }
}

/** Converts generated manifest metadata into render-pixi frame rects. */
export function assetFrames(
  asset: AssetMetadata,
  dimensions?: AssetDimensions,
): SpriteFrame[] {
  if (Array.isArray(asset.frames)) {
    return asset.frames.map((frame) => {
      const result = { x: frame.x, y: frame.y, width: frame.width, height: frame.height }
      checkBounds(result, dimensions)
      return result
    })
  }
  const { frameWidth, frameHeight } = asset
  if (frameWidth === undefined || frameHeight === undefined) {
    return []
  }
  const margin = asset.margin ?? 0
  const spacing = asset.spacing ?? 0
  const explicitCount = typeof asset.frames === 'number' ? asset.frames : undefined
  const count =
    explicitCount ??
    (asset.columns !== undefined && asset.rows !== undefined ? asset.columns * asset.rows : undefined)
  if (count === undefined) {
    return []
  }
  let columns = asset.columns
  if (columns === undefined) {
    columns = asset.rows !== undefined
      ? Math.ceil(count / asset.rows)
      : dimensions?.width !== undefined
        ? Math.floor((dimensions.width - margin * 2 + spacing) / (frameWidth + spacing))
        : count
  }
  const frames = sheetFrames({
    frameWidth,
    frameHeight,
    columns,
    count,
    margin,
    spacing,
  })
  for (const frame of frames) {
    checkBounds(frame, dimensions)
  }
  return frames
}

/** Converts Aseprite-style per-frame milliseconds to display seconds. */
export function assetAnimationDurations(
  animation: AssetAnimationSpec,
): readonly number[] | undefined {
  if (animation.durations === undefined) {
    return undefined
  }
  return animation.durations.map((duration) => duration / 1000)
}

/** Resolves one animation tag to frame rects using the same frame list. */
export function animationFrames(
  asset: AssetMetadata,
  animation: AssetAnimationSpec,
  dimensions?: AnimationFrameOptions,
): SpriteFrame[] {
  const frames = assetFrames(asset, dimensions)
  const row = dimensions?.row ?? 0
  if (!Number.isInteger(row) || row < 0 || (asset.rows !== undefined && row >= asset.rows) ||
    (row > 0 && asset.columns === undefined)) throw new Error(`animation ${animation.name} has invalid row ${row}`)
  const offset = row * (asset.columns ?? 0)
  let result: SpriteFrame[]
  if (animation.columns !== undefined) {
    result = animation.columns.map((index) => {
      const frame = frames[index + offset]
      if (frame === undefined) {
        throw new Error(`animation ${animation.name} frame ${index} is outside ${frames.length} frames`)
      }
      return frame
    })
  } else if (animation.frames !== undefined) {
    const start = (animation.from ?? 0) + offset
    if (!Number.isInteger(start) || start < 0 || !Number.isInteger(animation.frames) || animation.frames <= 0) {
      throw new Error(`animation ${animation.name} has an invalid frame range`)
    }
    result = frames.slice(start, start + animation.frames)
    if (result.length !== animation.frames) {
      throw new Error(`animation ${animation.name} frame range exceeds ${frames.length} frames`)
    }
  } else {
    result = frames.slice((animation.from ?? 0) + offset)
  }
  if (animation.durations !== undefined && animation.durations.length !== result.length) {
    throw new Error(
      `animation ${animation.name} has ${animation.durations.length} durations for ${result.length} frames`,
    )
  }
  return result
}

/** Manifest entry for `TextureStore.loadManifest`, including explicit frames. */
export function textureEntryFromAsset(
  asset: AssetMetadata,
  source: TextureSource,
  dimensions?: AssetDimensions,
): TextureManifestEntry {
  const frames = assetFrames(asset, dimensions)
  return {
    source,
    ...(dimensions?.width === undefined ? {} : { width: dimensions.width }),
    ...(dimensions?.height === undefined ? {} : { height: dimensions.height }),
    ...(frames.length === 0 ? {} : { frames }),
  }
}

const IMAGE_TYPE_BY_NAME: Readonly<Record<string, true>> = {
  sprite: true,
  sheet: true,
  spritesheet: true,
  tileset: true,
  atlas: true,
  image: true,
}

/** Converts generated `Assets` metadata into a `TextureStore` manifest. The game
 * supplies URL construction; the framework owns frame slicing. Audio/font and
 * other non-texture assets are skipped.
 */
export function textureManifestFromAssets(
  assets: Readonly<Record<string, AssetMetadata>>,
  sourceFor: (file: string, id: string) => TextureSource,
): TextureManifest {
  const manifest: Record<string, TextureManifestEntry> = {}
  for (const [id, asset] of Object.entries(assets)) {
    if (asset.type !== undefined && IMAGE_TYPE_BY_NAME[asset.type] !== true) {
      continue
    }
    if (asset.file === undefined) {
      throw new Error(`asset ${id} has no file`)
    }
    manifest[id] = textureEntryFromAsset(asset, sourceFor(asset.file, id))
  }
  return manifest
}
