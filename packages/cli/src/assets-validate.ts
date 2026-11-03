import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { colorCount, decodePng, hasTransparentBorder, type PngImage } from './png.js'
import {
  ASSET_TYPES,
  isImageType,
  isRecord,
  type AssetEntry,
  type AssetLimits,
  type AssetManifest,
} from './assets-schema.js'
import {
  nonNegativeInteger,
  positiveInteger,
  validateAnchor,
  validateAnimation,
  validateFrameRect,
  validateGrid,
} from './assets-frames.js'
import { pathExists } from './project.js'

export interface ValidatedAssets {
  readonly errors: readonly string[]
  readonly images: ReadonlyMap<string, PngImage>
}

function isSafeRelative(file: string): boolean {
  return (
    file.length > 0 &&
    !file.startsWith('/') &&
    !/^[A-Za-z]:/.test(file) &&
    !file.includes('\\') &&
    file.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..')
  )
}

const FONT_EXTENSIONS: Readonly<Record<string, true>> = {
  '.woff': true,
  '.woff2': true,
  '.ttf': true,
  '.otf': true,
}

const AUDIO_EXTENSIONS: Readonly<Record<string, true>> = {
  '.wav': true,
  '.mp3': true,
  '.ogg': true,
  '.m4a': true,
  '.aac': true,
  '.flac': true,
  '.opus': true,
}

function extension(file: string): string {
  const dot = file.lastIndexOf('.')
  return dot === -1 ? '' : file.slice(dot).toLowerCase()
}

function validateLimits(limits: unknown, errors: string[]): void {
  if (limits === undefined) {
    return
  }
  if (!isRecord(limits)) {
    errors.push('LG009 assets/manifest.json limits must be an object')
    return
  }
  if (limits['maxDimension'] !== undefined) {
    positiveInteger(limits['maxDimension'], 'limits.maxDimension', errors)
  }
  if (limits['maxColors'] !== undefined) {
    positiveInteger(limits['maxColors'], 'limits.maxColors', errors)
  }
  if (limits['transparentBorder'] !== undefined && typeof limits['transparentBorder'] !== 'boolean') {
    errors.push('LG009 limits.transparentBorder must be a boolean')
  }
}

async function readImage(
  entry: AssetEntry,
  index: number,
  cwd: string,
  errors: string[],
): Promise<PngImage | undefined> {
  if (typeof entry.file !== 'string' || !isSafeRelative(entry.file)) {
    errors.push(`LG009 asset[${index}].file must be a relative path inside assets/: ${String(entry.file)}`)
    return undefined
  }
  const filePath = join(cwd, 'assets', entry.file)
  if (!(await pathExists(filePath))) {
    errors.push(`LG009 asset ${entry.id ?? index} file is missing: assets/${entry.file}`)
    return undefined
  }
  const suffix = extension(entry.file)
  if (entry.type === 'font' && FONT_EXTENSIONS[suffix] !== true) {
    errors.push(`LG009 asset ${entry.id ?? index} font must be .woff/.woff2/.ttf/.otf`)
  }
  if (entry.type === 'audio' && AUDIO_EXTENSIONS[suffix] !== true) {
    errors.push(`LG009 asset ${entry.id ?? index} audio must be a supported audio file`)
  }
  if (!isImageType(entry.type)) {
    return undefined
  }
  if (!/\.png$/i.test(entry.file)) {
    errors.push(`LG009 asset ${entry.id ?? index} image must be a .png file`)
    return undefined
  }
  try {
    return decodePng(await readFile(filePath))
  } catch (error) {
    errors.push(
      `LG009 asset ${entry.id ?? index} is not a readable PNG: ${error instanceof Error ? error.message : String(error)}`,
    )
    return undefined
  }
}

function validateExplicitFrames(
  entry: AssetEntry,
  frames: readonly unknown[],
  image: PngImage | undefined,
  errors: string[],
): number {
  if (frames.length === 0) {
    errors.push(`LG009 asset[${entry.id}].frames must not be empty`)
  }
  const seen = new Set<string>()
  for (let index = 0; index < frames.length; index += 1) {
    const rect = frames[index]
    if (image !== undefined) {
      validateFrameRect(rect, `asset ${entry.id}.frames[${index}]`, image, errors)
    }
    if (isRecord(rect)) {
      const key = `${String(rect['x'])},${String(rect['y'])},${String(rect['width'])},${String(rect['height'])}`
      if (seen.has(key)) {
        errors.push(`LG009 asset ${entry.id}.frames repeats rectangle ${key}`)
      }
      seen.add(key)
    }
  }
  if (entry.columns !== undefined && entry.rows !== undefined && frames.length > entry.columns * entry.rows) {
    errors.push(`LG009 asset ${entry.id}.frames ${frames.length} exceeds ${entry.columns}x${entry.rows}`)
  }
  return frames.length
}

function validateAnimations(
  entry: AssetEntry,
  frameCount: number | undefined,
  errors: string[],
): void {
  if (entry.animations === undefined) {
    return
  }
  if (!Array.isArray(entry.animations)) {
    errors.push(`LG009 asset[${entry.id}].animations must be an array`)
    return
  }
  if (frameCount === undefined) {
    errors.push(`LG009 asset ${entry.id} animations require frame metadata`)
  }
  const names = new Set<string>()
  for (const animation of entry.animations) {
    const name = isRecord(animation) && typeof animation['name'] === 'string' ? animation['name'] : ''
    if (names.has(name)) {
      errors.push(`LG009 asset ${entry.id} has duplicate animation ${name}`)
    }
    names.add(name)
    validateAnimation(animation, entry, frameCount, errors)
  }
}

async function validateEntry(
  entry: unknown,
  index: number,
  cwd: string,
  limits: AssetLimits | undefined,
  errors: string[],
): Promise<{ id: string; image?: PngImage } | undefined> {
  if (!isRecord(entry)) {
    errors.push(`LG009 asset[${index}] must be an object`)
    return undefined
  }
  const typed = entry as AssetEntry
  const label = `asset[${index}]`
  if (typeof typed.id !== 'string' || typed.id.length === 0) {
    errors.push(`LG009 ${label}.id must be a non-empty string`)
  }
  if (typeof typed.type !== 'string' || !(ASSET_TYPES as readonly string[]).includes(typed.type)) {
    errors.push(`LG009 ${label}.type is not recognized: ${String(typed.type)}`)
  }
  const image = await readImage(typed, index, cwd, errors)
  if (typed.nineSlice !== undefined) {
    const slice: unknown = typed.nineSlice
    if (!isRecord(slice) || typeof slice['border'] !== 'number' || !Number.isInteger(slice['border']) || slice['border'] <= 0 ||
      (image !== undefined && slice['border'] * 2 >= Math.min(image.width, image.height))) {
      errors.push(`LG009 ${label}.nineSlice.border must leave a nonempty image center`)
    }
  }
  for (const key of ['frameWidth', 'frameHeight', 'columns', 'rows'] as const) {
    const value = typed[key]
    if (value !== undefined) {
      positiveInteger(value, `${label}.${key}`, errors)
    }
  }
  for (const key of ['margin', 'spacing'] as const) {
    const value = typed[key]
    if (value !== undefined) {
      nonNegativeInteger(value, `${label}.${key}`, errors)
    }
  }
  if (typed.fps !== undefined && typed.fps !== null) {
    if (typeof typed.fps !== 'number' || !Number.isFinite(typed.fps) || typed.fps <= 0) {
      errors.push(`LG009 ${label}.fps must be positive or null`)
    }
  }
  if (typed.anchor !== undefined) {
    validateAnchor(typed.anchor, label, errors)
  }
  let frameCount: number | undefined
  if (Array.isArray(typed.frames)) {
    frameCount = validateExplicitFrames(typed, typed.frames, image, errors)
  } else if (typed.frames !== undefined) {
    positiveInteger(typed.frames, `${label}.frames`, errors)
    if (typeof typed.frames === 'number') {
      frameCount = typed.frames
    }
  }
  if (image !== undefined && !Array.isArray(typed.frames)) {
    frameCount = validateGrid(typed, image, errors) ?? frameCount
  }
  if (image !== undefined && limits !== undefined) {
    if (
      limits.maxDimension !== undefined &&
      (image.width > limits.maxDimension || image.height > limits.maxDimension)
    ) {
      errors.push(
        `LG009 asset ${typed.id} is ${image.width}x${image.height}, above limit ${limits.maxDimension}`,
      )
    }
    if (limits.maxColors !== undefined && colorCount(image) > limits.maxColors) {
      errors.push(`LG009 asset ${typed.id} uses more than ${limits.maxColors} colors`)
    }
    if (limits.transparentBorder === true && !hasTransparentBorder(image)) {
      errors.push(`LG009 asset ${typed.id} must have a transparent 1px border`)
    }
  }
  validateAnimations(typed, frameCount, errors)
  return {
    id: typeof typed.id === 'string' ? typed.id : String(index),
    ...(image === undefined ? {} : { image }),
  }
}

export async function validateManifest(
  manifest: AssetManifest,
  cwd: string,
): Promise<ValidatedAssets> {
  const errors: string[] = []
  const images = new Map<string, PngImage>()
  if (typeof manifest.pack !== 'string' || manifest.pack.length === 0) {
    errors.push('LG009 assets/manifest.json requires a non-empty pack')
  }
  if (
    typeof manifest.version !== 'string' &&
    (typeof manifest.version !== 'number' || !Number.isFinite(manifest.version))
  ) {
    errors.push('LG009 assets/manifest.json requires a string or number version')
  } else if (typeof manifest.version === 'string' && manifest.version.length === 0) {
    errors.push('LG009 assets/manifest.json version must not be empty')
  }
  validateLimits(manifest.limits, errors)
  if (!Array.isArray(manifest.assets)) {
    errors.push('LG009 assets/manifest.json requires an assets array')
    return { errors, images }
  }
  const limits = isRecord(manifest.limits) ? (manifest.limits as AssetLimits) : undefined
  const seen = new Set<string>()
  for (let index = 0; index < manifest.assets.length; index += 1) {
    const entry = manifest.assets[index]
    if (isRecord(entry) && typeof entry['id'] === 'string') {
      if (seen.has(entry['id'])) {
        errors.push(`LG009 duplicate asset id ${entry['id']}`)
      }
      seen.add(entry['id'])
    }
    const validated = await validateEntry(entry, index, cwd, limits, errors)
    if (validated?.image !== undefined) {
      images.set(validated.id, validated.image)
    }
  }
  return { errors, images }
}

