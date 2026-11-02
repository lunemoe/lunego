import type { RenderLayer, SpriteFrame, TextureId } from './types.js'
import { cameraWorldTransform } from './viewport.js'

export interface TilesetDefinition {
  readonly texture: TextureId
  readonly tileWidth: number
  readonly tileHeight: number
  /** Number of source tiles per row in the tileset texture. */
  readonly columns: number
  readonly margin?: number
  readonly spacing?: number
}

export interface TilemapLayerData {
  readonly name: string
  readonly width: number
  readonly height: number
  /** Row-major tile indices; -1 (or any negative) means empty. */
  readonly tiles: readonly number[]
  /** Tiles default behind entities; foreground covers actors. */
  readonly layer?: Extract<RenderLayer, 'tiles' | 'foreground'>
  readonly visible?: boolean
}

export interface TilemapDefinition {
  readonly tileset: TilesetDefinition
  readonly layers: readonly TilemapLayerData[]
  /** World pixel offset of the map origin. */
  readonly originX?: number
  readonly originY?: number
}

export interface TileInstance {
  /** Stable cell identity: layer/row/column. */
  readonly key: string
  readonly layer: Extract<RenderLayer, 'tiles' | 'foreground'>
  readonly layerName: string
  readonly column: number
  readonly row: number
  readonly index: number
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly frame: SpriteFrame
}

export function tileFrame(tileset: TilesetDefinition, index: number): SpriteFrame {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`tile index must be a non-negative integer, got ${index}`)
  }
  const columns = Math.max(1, tileset.columns)
  const margin = tileset.margin ?? 0
  const spacing = tileset.spacing ?? 0
  const column = index % columns
  const row = Math.floor(index / columns)
  return {
    x: margin + column * (tileset.tileWidth + spacing),
    y: margin + row * (tileset.tileHeight + spacing),
    width: tileset.tileWidth,
    height: tileset.tileHeight,
  }
}

/** Pure layout pass: game-owned map data -> drawable tile cells. */
export function buildTilemap(definition: TilemapDefinition): TileInstance[] {
  const { tileset } = definition
  if (
    !Number.isInteger(tileset.tileWidth) ||
    !Number.isInteger(tileset.tileHeight) ||
    tileset.tileWidth <= 0 ||
    tileset.tileHeight <= 0 ||
    !Number.isInteger(tileset.columns) ||
    tileset.columns <= 0
  ) {
    throw new Error('tileset dimensions and columns must be positive integers')
  }
  for (const value of [tileset.margin ?? 0, tileset.spacing ?? 0]) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('tileset margin and spacing must be non-negative')
    }
  }
  const originX = definition.originX ?? 0
  const originY = definition.originY ?? 0
  if (!Number.isFinite(originX) || !Number.isFinite(originY)) {
    throw new Error('tilemap origin must be finite')
  }
  const instanceList: TileInstance[] = []
  const layerNames = new Set<string>()
  for (const layer of definition.layers) {
    if (layerNames.has(layer.name)) {
      throw new Error(`duplicate tilemap layer ${layer.name}`)
    }
    layerNames.add(layer.name)
    if (
      !Number.isInteger(layer.width) ||
      !Number.isInteger(layer.height) ||
      layer.width <= 0 ||
      layer.height <= 0
    ) {
      throw new Error(`tilemap layer ${layer.name} dimensions must be positive integers`)
    }
    if (layer.tiles.length !== layer.width * layer.height) {
      throw new Error(
        `tilemap layer ${layer.name} has ${layer.tiles.length} cells, expected ${layer.width * layer.height}`,
      )
    }
    const target = layer.layer ?? 'tiles'
    for (let row = 0; row < layer.height; row += 1) {
      for (let column = 0; column < layer.width; column += 1) {
        const index = layer.tiles[row * layer.width + column]
        if (index < 0) {
          continue
        }
        if (!Number.isSafeInteger(index)) {
          throw new Error(`tilemap layer ${layer.name} has a non-integer tile index`)
        }
        instanceList.push({
          key: `${layer.name}:${row}:${column}`,
          layer: target,
          layerName: layer.name,
          column,
          row,
          index,
          x: originX + column * tileset.tileWidth,
          y: originY + row * tileset.tileHeight,
          width: tileset.tileWidth,
          height: tileset.tileHeight,
          frame: tileFrame(tileset, index),
        })
      }
    }
  }
  return instanceList
}

export interface TileSink<Handle> {
  create(instance: TileInstance): Handle
  destroy(handle: Handle): void
}

export interface TilemapTransform {
  readonly x: number
  readonly y: number
  readonly scale: number
}

export function cameraTransform(
  cameraX: number,
  cameraY: number,
  zoom: number,
  pixelSnap = true,
): TilemapTransform {
  return cameraWorldTransform(cameraX, cameraY, zoom, pixelSnap)
}

/**
 * Owns tile handles so replacing a map destroys exactly the old instances and
 * reuses a sink without leaking display objects.
 */
export class TilemapView<Handle> {
  private readonly sink: TileSink<Handle>
  private handles = new Map<string, Handle>()
  private destroyed = false

  constructor(sink: TileSink<Handle>) {
    this.sink = sink
  }

  get count(): number {
    return this.handles.size
  }

  setMap(definition: TilemapDefinition | null): void {
    if (this.destroyed) {
      throw new Error('tilemap view is destroyed')
    }
    if (definition === null) {
      this.clear()
      return
    }
    const instances = buildTilemap(definition)
    this.clear()
    for (const instance of instances) {
      this.handles.set(instance.key, this.sink.create(instance))
    }
  }

  clear(): void {
    for (const handle of this.handles.values()) {
      this.sink.destroy(handle)
    }
    this.handles.clear()
  }

  destroy(): void {
    if (this.destroyed) {
      return
    }
    this.clear()
    this.destroyed = true
  }
}
