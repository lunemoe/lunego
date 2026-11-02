export const ASSET_TYPES = [
  'sprite',
  'sheet',
  'spritesheet',
  'tileset',
  'atlas',
  'image',
  'audio',
  'font',
  'json',
  'ldtk',
] as const

export type AssetType = (typeof ASSET_TYPES)[number]

export const ASSET_ANCHORS = [
  'top-left',
  'top',
  'top-center',
  'top-right',
  'left',
  'center',
  'center-left',
  'center-right',
  'right',
  'bottom-left',
  'bottom',
  'bottom-center',
  'bottom-right',
  'feet',
] as const

export type AssetAnchorName = (typeof ASSET_ANCHORS)[number]

export interface AssetAnchorPoint {
  /** Normalized horizontal anchor, 0..1. */
  readonly x: number
  /** Normalized vertical anchor, 0..1. */
  readonly y: number
}

export type AssetAnchor = AssetAnchorName | AssetAnchorPoint

/** A source-pixel rectangle inside an image or atlas. */
export interface AssetFrameRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface AssetAnimation {
  readonly name: string
  /** Explicit frame indices in playback order. */
  readonly columns?: readonly number[]
  /** Number of frames; with `from` this is a contiguous range. */
  readonly frames?: number
  /** First frame index for a contiguous range. */
  readonly from?: number
  readonly fps?: number | null
  readonly loop?: boolean
  /** Per-frame duration in milliseconds from Aseprite exports. */
  readonly durations?: readonly number[]
}

export interface AssetEntry {
  readonly id: string
  readonly file: string
  readonly type: string
  readonly frameWidth?: number
  readonly frameHeight?: number
  readonly columns?: number
  readonly rows?: number
  /** Frame count for uniform grids, or explicit frame rectangles for packed atlases. */
  readonly frames?: number | readonly AssetFrameRect[]
  readonly margin?: number
  readonly spacing?: number
  readonly fps?: number | null
  readonly anchor?: AssetAnchor
  readonly animations?: readonly AssetAnimation[]
  readonly [key: string]: unknown
}

export interface AssetLimits {
  readonly maxDimension?: number
  readonly maxColors?: number
  readonly transparentBorder?: boolean
}

export interface AssetManifest {
  readonly pack: string
  readonly version: string | number
  readonly assets: readonly AssetEntry[]
  readonly limits?: AssetLimits
  readonly [key: string]: unknown
}

const IMAGE_TYPE_BY_NAME: Readonly<Record<string, true>> = {
  sprite: true,
  sheet: true,
  spritesheet: true,
  tileset: true,
  atlas: true,
  image: true,
}

const ANCHOR_POINTS: Readonly<Record<AssetAnchorName, AssetAnchorPoint>> = {
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

export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function anchorPoint(anchor: AssetAnchor): AssetAnchorPoint | undefined {
  if (typeof anchor === 'string') {
    return ANCHOR_POINTS[anchor as AssetAnchorName]
  }
  if (
    isRecord(anchor) &&
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

/** Locale-independent JSON used for asset hashes and generated files. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? 'null' : stableStringify(item))).join(',')}]`
  }
  if (isRecord(value)) {
    const fields = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort(compareText)
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    return `{${fields.join(',')}}`
  }
  return JSON.stringify(value)
}

export function isImageType(type: string): boolean {
  return IMAGE_TYPE_BY_NAME[type] === true
}
