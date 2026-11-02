import { isRecord, type AssetAnchor, type AssetAnimation, type AssetEntry, type AssetFrameRect } from './assets-schema.js'

export interface AsepriteImportOptions {
  readonly id: string
  readonly file: string
  readonly imageWidth?: number
  readonly imageHeight?: number
  readonly anchor?: AssetAnchor
}

export interface AsepriteImportResult {
  readonly entry: AssetEntry
  readonly warnings: readonly string[]
}

interface ParsedFrame {
  readonly filename: string
  readonly rect: AssetFrameRect
  readonly duration: number
  readonly trimmed: boolean
}

interface ParsedTag {
  readonly name: string
  readonly from: number
  readonly to: number
  readonly direction: string
}

interface ParsedAseprite {
  readonly frames: readonly ParsedFrame[]
  readonly tags: readonly ParsedTag[]
  readonly size?: { readonly width: number; readonly height: number }
  readonly pivot?: { readonly x: number; readonly y: number }
}

function requireInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`aseprite ${label} must be a non-negative integer`)
  }
  return value
}

function parseRect(value: unknown, label: string): AssetFrameRect {
  if (!isRecord(value)) {
    throw new Error(`aseprite ${label} must be an object`)
  }
  const width = requireInteger(value['w'], `${label}.w`)
  const height = requireInteger(value['h'], `${label}.h`)
  if (width === 0 || height === 0) {
    throw new Error(`aseprite ${label} must have positive width and height`)
  }
  return {
    x: requireInteger(value['x'], `${label}.x`),
    y: requireInteger(value['y'], `${label}.y`),
    width,
    height,
  }
}

function parsePivot(meta: Record<string, unknown>): { x: number; y: number } | undefined {
  const slices = meta['slices']
  if (!Array.isArray(slices)) {
    return undefined
  }
  for (const slice of slices) {
    if (!isRecord(slice) || !Array.isArray(slice['keys'])) {
      continue
    }
    for (const key of slice['keys']) {
      if (!isRecord(key) || !isRecord(key['pivot'])) {
        continue
      }
      const x = key['pivot']['x']
      const y = key['pivot']['y']
      if (
        typeof x === 'number' &&
        typeof y === 'number' &&
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        x >= 0 &&
        x <= 1 &&
        y >= 0 &&
        y <= 1
      ) {
        return { x, y }
      }
    }
  }
  return undefined
}

function parseFrames(raw: unknown): ParsedFrame[] {
  const frames: ParsedFrame[] = []
  const visit = (entry: unknown, label: string): void => {
    if (!isRecord(entry)) {
      throw new Error(`aseprite ${label} must be an object`)
    }
    if (entry['rotated'] === true) {
      throw new Error(`aseprite ${label} is rotated; export without rotation`)
    }
    const rect = parseRect(entry['frame'], `${label}.frame`)
    const duration = entry['duration']
    const trimmed = entry['trimmed'] === true
    frames.push({
      filename: typeof entry['filename'] === 'string' ? entry['filename'] : label,
      rect,
      duration:
        typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration : 100,
      trimmed,
    })
  }
  if (Array.isArray(raw)) {
    raw.forEach((entry, index) => visit(entry, `frames[${index}]`))
    return frames
  }
  if (isRecord(raw)) {
    for (const key of Object.keys(raw)) {
      visit(raw[key], `frames[${JSON.stringify(key)}]`)
    }
    return frames
  }
  throw new Error('aseprite JSON requires a frames array or object')
}

function parseTags(meta: Record<string, unknown>, frameCount: number): ParsedTag[] {
  const raw = meta['frameTags']
  if (raw === undefined) {
    return []
  }
  if (!Array.isArray(raw)) {
    throw new Error('aseprite meta.frameTags must be an array')
  }
  const names = new Set<string>()
  return raw.map((tag, index) => {
    if (!isRecord(tag) || typeof tag['name'] !== 'string' || tag['name'].length === 0) {
      throw new Error(`aseprite meta.frameTags[${index}] needs a non-empty name`)
    }
    const name = tag['name']
    if (names.has(name)) {
      throw new Error(`aseprite meta.frameTags has duplicate tag ${name}`)
    }
    names.add(name)
    const from = requireInteger(tag['from'], `tag ${name}.from`)
    const to = requireInteger(tag['to'], `tag ${name}.to`)
    if (from > to || to >= frameCount) {
      throw new Error(`aseprite tag ${name} range ${from}..${to} is outside ${frameCount} frames`)
    }
    const direction = typeof tag['direction'] === 'string' ? tag['direction'] : 'forward'
    if (!['forward', 'reverse', 'pingpong'].includes(direction)) {
      throw new Error(`aseprite tag ${name} has unknown direction ${direction}`)
    }
    return { name, from, to, direction }
  })
}

function parseAseprite(json: unknown): ParsedAseprite {
  if (!isRecord(json)) {
    throw new Error('aseprite JSON must contain an object')
  }
  const frames = parseFrames(json['frames'])
  if (frames.length === 0) {
    throw new Error('aseprite JSON has no frames')
  }
  const meta = isRecord(json['meta']) ? json['meta'] : {}
  const sizeValue = meta['size']
  let size: { width: number; height: number } | undefined
  if (isRecord(sizeValue)) {
    const width = requireInteger(sizeValue['w'], 'meta.size.w')
    const height = requireInteger(sizeValue['h'], 'meta.size.h')
    if (width === 0 || height === 0) {
      throw new Error('aseprite meta.size must be positive')
    }
    size = { width, height }
  }
  const pivot = parsePivot(meta)
  return {
    frames,
    tags: parseTags(meta, frames.length),
    ...(size === undefined ? {} : { size }),
    ...(pivot === undefined ? {} : { pivot }),
  }
}

function playbackIndices(tag: ParsedTag): number[] {
  const forward: number[] = []
  for (let index = tag.from; index <= tag.to; index += 1) {
    forward.push(index)
  }
  if (tag.direction === 'reverse') {
    return forward.reverse()
  }
  if (tag.direction === 'pingpong' && forward.length > 2) {
    return [...forward, ...forward.slice(1, -1).reverse()]
  }
  return forward
}

function averageFps(durations: readonly number[]): number {
  const total = durations.reduce((sum, value) => sum + value, 0)
  return Math.round((1000 / (total / durations.length)) * 1000) / 1000
}

function animationsFor(tags: readonly ParsedTag[], frames: readonly ParsedFrame[]): AssetAnimation[] {
  return tags.map((tag) => {
    const indices = playbackIndices(tag)
    const durations = indices.map((index) => frames[index]!.duration)
    return {
      name: tag.name,
      columns: indices,
      frames: indices.length,
      fps: averageFps(durations),
      loop: true,
      durations,
    }
  })
}

/** Import an Aseprite JSON export. Trimming offsets are reported, never silently repositioned. */
export function importAseprite(json: unknown, options: AsepriteImportOptions): AsepriteImportResult {
  if (options.id.length === 0) {
    throw new Error('aseprite import requires a non-empty id')
  }
  if (options.file.length === 0) {
    throw new Error('aseprite import requires a non-empty file')
  }
  const parsed = parseAseprite(json)
  if (parsed.size !== undefined && options.imageWidth !== undefined && options.imageHeight !== undefined) {
    if (parsed.size.width !== options.imageWidth || parsed.size.height !== options.imageHeight) {
      throw new Error(
        `aseprite meta.size ${parsed.size.width}x${parsed.size.height} does not match PNG ${options.imageWidth}x${options.imageHeight}`,
      )
    }
  }
  const warnings: string[] = []
  const frames = parsed.frames.map((frame) => frame.rect)
  const imageWidth = options.imageWidth ?? parsed.size?.width
  const imageHeight = options.imageHeight ?? parsed.size?.height
  if (imageWidth !== undefined && imageHeight !== undefined) {
    for (const [index, rect] of frames.entries()) {
      if (rect.x + rect.width > imageWidth || rect.y + rect.height > imageHeight) {
        throw new Error(`aseprite frame ${index} exceeds the ${imageWidth}x${imageHeight} image`)
      }
    }
  }
  if (parsed.frames.some((frame) => frame.trimmed)) {
    warnings.push('aseprite trimmed frames keep their trimmed rects; spriteSourceSize offsets are not applied')
  }
  const animations = animationsFor(parsed.tags, parsed.frames)
  const first = frames[0]!
  const uniform = frames.every((frame) => frame.width === first.width && frame.height === first.height)
  const anchor = options.anchor ?? parsed.pivot
  const entry: AssetEntry = {
    id: options.id,
    file: options.file,
    type: frames.length > 1 ? 'spritesheet' : 'sprite',
    frames,
    ...(uniform ? { frameWidth: first.width, frameHeight: first.height } : {}),
    ...(animations.length === 0 ? {} : { fps: animations[0]!.fps ?? null, animations }),
    ...(anchor === undefined ? {} : { anchor }),
  }
  return { entry, warnings }
}

export function parseAsepriteJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    throw new Error(`aseprite JSON is invalid: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }
}
