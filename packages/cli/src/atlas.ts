import { readFile } from 'node:fs/promises'
import { compareText, type AssetEntry, type AssetFrameRect } from './assets-schema.js'
import { decodePng, encodePng } from './png.js'

export interface AtlasInput {
  readonly id: string
  readonly path: string
}

export interface AtlasOptions {
  /** Fixed shelf width; the output is deterministic for the same inputs. */
  readonly width?: number
  /** Transparent pixels between frames and around the atlas. */
  readonly padding?: number
}

export interface AtlasFrame extends AssetFrameRect {
  readonly id: string
}

export interface AtlasResult {
  readonly png: Buffer
  readonly width: number
  readonly height: number
  readonly frames: readonly AtlasFrame[]
}

export interface AtlasManifest {
  readonly file: string
  readonly width: number
  readonly height: number
  readonly frames: readonly AtlasFrame[]
}

interface LoadedFrame {
  readonly id: string
  readonly width: number
  readonly height: number
  readonly data: Buffer
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`atlas ${label} must be a positive integer`)
  }
  return value
}

function blit(target: Buffer, targetWidth: number, frame: LoadedFrame, x: number, y: number): void {
  for (let row = 0; row < frame.height; row += 1) {
    const sourceStart = row * frame.width * 4
    const targetStart = ((y + row) * targetWidth + x) * 4
    frame.data.copy(target, targetStart, sourceStart, sourceStart + frame.width * 4)
  }
}

/**
 * Deterministic shelf packer. Inputs are sorted by id using code-unit comparison;
 * no locale, time, or hash-map iteration order affects the layout or pixels.
 */
export async function packAtlas(
  inputs: readonly AtlasInput[],
  options: AtlasOptions = {},
): Promise<AtlasResult> {
  if (inputs.length === 0) {
    throw new Error('atlas needs at least one input frame')
  }
  const padding = options.padding ?? 0
  if (!Number.isInteger(padding) || padding < 0) {
    throw new Error('atlas padding must be a non-negative integer')
  }
  const loaded: LoadedFrame[] = []
  const ids = new Set<string>()
  for (const input of inputs) {
    if (input.id.length === 0) {
      throw new Error('atlas input id must not be empty')
    }
    if (ids.has(input.id)) {
      throw new Error(`atlas input id is duplicated: ${input.id}`)
    }
    ids.add(input.id)
    let image
    try {
      image = decodePng(await readFile(input.path))
    } catch (error) {
      throw new Error(
        `atlas input ${input.id} is not a readable PNG: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
    loaded.push({
      id: input.id,
      width: positiveInteger(image.width, `input ${input.id} width`),
      height: positiveInteger(image.height, `input ${input.id} height`),
      data: image.data,
    })
  }
  loaded.sort((left, right) => compareText(left.id, right.id))
  const widest = loaded.reduce((max, frame) => Math.max(max, frame.width), 0)
  const width = options.width ?? 512
  if (!Number.isInteger(width) || width <= 0) {
    throw new Error('atlas width must be a positive integer')
  }
  if (width < widest + padding * 2) {
    throw new Error(`atlas width ${width} cannot fit the widest frame ${widest} plus padding`)
  }

  let cursorX = padding
  let cursorY = padding
  let shelfHeight = 0
  const placements: AtlasFrame[] = []
  for (const frame of loaded) {
    if (cursorX > padding && cursorX + frame.width + padding > width) {
      cursorY += shelfHeight + padding
      cursorX = padding
      shelfHeight = 0
    }
    placements.push({
      id: frame.id,
      x: cursorX,
      y: cursorY,
      width: frame.width,
      height: frame.height,
    })
    cursorX += frame.width + padding
    shelfHeight = Math.max(shelfHeight, frame.height)
  }
  const height = cursorY + shelfHeight + padding
  const data = Buffer.alloc(width * height * 4)
  for (const [index, frame] of loaded.entries()) {
    const placement = placements[index]!
    blit(data, width, frame, placement.x, placement.y)
  }
  return {
    png: encodePng({ width, height, data }),
    width,
    height,
    frames: placements,
  }
}

export function atlasManifest(result: AtlasResult, file: string): AtlasManifest {
  return {
    file,
    width: result.width,
    height: result.height,
    frames: result.frames,
  }
}

export function atlasAssetEntry(id: string, file: string, result: AtlasResult): AssetEntry {
  return {
    id,
    file,
    type: 'atlas',
    frames: result.frames.map((frame) => ({
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
    })),
  }
}
