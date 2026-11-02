import { isRecord, type AssetEntry } from './assets-schema.js'

export interface LdtkResolvedTileset {
  /** Path relative to the assets directory, POSIX separators. */
  readonly file: string
  readonly width: number
  readonly height: number
}

export interface LdtkImportOptions {
  readonly idPrefix?: string
  readonly resolve: (relPath: string) => LdtkResolvedTileset | undefined
}

export interface LdtkImportResult {
  readonly entries: readonly AssetEntry[]
  readonly warnings: readonly string[]
  readonly levels: number
  readonly entities: number
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`LDtk ${label} must be a positive integer`)
  }
  return value
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`LDtk ${label} must be a non-negative integer`)
  }
  return value
}

function tilesetEntry(
  tileset: Record<string, unknown>,
  options: LdtkImportOptions,
): AssetEntry {
  const identifier = tileset['identifier']
  const relPath = tileset['relPath']
  if (typeof identifier !== 'string' || identifier.length === 0) {
    throw new Error('LDtk tileset needs a non-empty identifier')
  }
  if (typeof relPath !== 'string' || relPath.length === 0) {
    throw new Error(`LDtk tileset ${identifier} needs a relPath`)
  }
  const resolved = options.resolve(relPath)
  if (resolved === undefined) {
    throw new Error(`LDtk tileset ${identifier} image is missing: ${relPath}`)
  }
  const tileSize = positiveInteger(tileset['tileGridSize'], `tileset ${identifier}.tileGridSize`)
  const padding = nonNegativeInteger(tileset['padding'] ?? 0, `tileset ${identifier}.padding`)
  const spacing = nonNegativeInteger(tileset['spacing'] ?? 0, `tileset ${identifier}.spacing`)
  const declaredWidth = positiveInteger(tileset['pxWid'], `tileset ${identifier}.pxWid`)
  const declaredHeight = positiveInteger(tileset['pxHei'], `tileset ${identifier}.pxHei`)
  if (declaredWidth !== resolved.width || declaredHeight !== resolved.height) {
    throw new Error(
      `LDtk tileset ${identifier} declares ${declaredWidth}x${declaredHeight} but ${resolved.file} is ${resolved.width}x${resolved.height}`,
    )
  }
  const columns = Math.floor((resolved.width - padding * 2 + spacing) / (tileSize + spacing))
  const rows = Math.floor((resolved.height - padding * 2 + spacing) / (tileSize + spacing))
  if (columns <= 0 || rows <= 0) {
    throw new Error(`LDtk tileset ${identifier} has no complete ${tileSize}x${tileSize} tiles`)
  }
  const prefix = options.idPrefix ?? ''
  return {
    id: `${prefix}${identifier}`,
    file: resolved.file,
    type: 'tileset',
    frameWidth: tileSize,
    frameHeight: tileSize,
    columns,
    rows,
    frames: columns * rows,
    margin: padding,
    spacing,
  }
}

function entityInstances(level: Record<string, unknown>): number {
  const layers = level['layerInstances']
  if (!Array.isArray(layers)) {
    return 0
  }
  let count = 0
  for (const layer of layers) {
    if (isRecord(layer) && Array.isArray(layer['entityInstances'])) {
      count += layer['entityInstances'].length
    }
  }
  return count
}

/**
 * Minimal LDtk import: tilesets become manifest entries. Levels and entities are
 * counted and reported, not turned into framework runtime dependencies.
 */
export function importLdtk(json: unknown, options: LdtkImportOptions): LdtkImportResult {
  if (!isRecord(json)) {
    throw new Error('LDtk JSON must contain an object')
  }
  const defs = isRecord(json['defs']) ? json['defs'] : {}
  const tilesets = defs['tilesets']
  if (!Array.isArray(tilesets)) {
    throw new Error('LDtk JSON requires defs.tilesets')
  }
  const entries: AssetEntry[] = tilesets.map((tileset) => {
    if (!isRecord(tileset)) {
      throw new Error('LDtk defs.tilesets entries must be objects')
    }
    return tilesetEntry(tileset, options)
  })
  const ids = new Set(entries.map((entry) => entry.id))
  if (ids.size !== entries.length) {
    throw new Error('LDtk tilesets produce duplicate manifest ids')
  }
  const levels = Array.isArray(json['levels']) ? json['levels'] : []
  let entities = 0
  for (const level of levels) {
    if (isRecord(level)) {
      entities += entityInstances(level)
    }
  }
  const warnings =
    levels.length === 0
      ? ['LDtk import only covers tilesets; no levels were found']
      : [
          `LDtk levels (${levels.length}) and entities (${entities}) are not imported; keep the LDtk JSON as game content until a level feature exists`,
        ]
  return { entries, warnings, levels: levels.length, entities }
}

export function parseLdtkJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    throw new Error(`LDtk JSON is invalid: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }
}
