import type { EncounterDef } from '@lunego/kit-encounter'
import type { Point } from '@lunego/kit-encounter'

export interface ZoneBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface ZoneDef {
  readonly id: string
  readonly bounds: ZoneBounds
  readonly chunkSize: number
  readonly spawnBudget: number
  readonly biome?: string
  readonly encounter?: EncounterDef
  readonly tags?: readonly string[]
}

export interface Portal {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly fromPoint: Point
  readonly toPoint: Point
  /** Default true. */
  readonly bidirectional?: boolean
}

export interface Waypoint {
  readonly id: string
  readonly zone: string
  readonly x: number
  readonly y: number
}

export interface ChunkCoord {
  readonly zone: string
  readonly cx: number
  readonly cy: number
}

export interface PortResult {
  readonly ok: boolean
  readonly reason?: 'unknown_zone' | 'unknown_portal' | 'not_connected' | 'budget'
  readonly zone?: string
}

function validateZone(zone: ZoneDef): void {
  if (zone.id.length === 0 || zone.bounds.width <= 0 || zone.bounds.height <= 0) {
    throw new Error(`zone ${zone.id} has invalid bounds`)
  }
  if (!Number.isInteger(zone.chunkSize) || zone.chunkSize < 1) {
    throw new Error(`zone ${zone.id} chunkSize must be positive`)
  }
  if (!Number.isInteger(zone.spawnBudget) || zone.spawnBudget < 0) {
    throw new Error(`zone ${zone.id} spawnBudget must be non-negative`)
  }
}

/** Zone/portal/waypoint graph with dangling-reference and connectivity checks. */
export class ZoneGraph {
  readonly zones: ReadonlyMap<string, ZoneDef>
  readonly portals: ReadonlyMap<string, Portal>
  readonly waypoints: ReadonlyMap<string, Waypoint>

  constructor(options: {
    readonly zones: readonly ZoneDef[]
    readonly portals?: readonly Portal[]
    readonly waypoints?: readonly Waypoint[]
  }) {
    const zones = new Map<string, ZoneDef>()
    const portals = new Map<string, Portal>()
    const waypoints = new Map<string, Waypoint>()
    for (const zone of options.zones) {
      validateZone(zone)
      if (zones.has(zone.id)) {
        throw new Error(`duplicate zone ${zone.id}`)
      }
      zones.set(zone.id, zone)
    }
    for (const portal of options.portals ?? []) {
      if (portals.has(portal.id)) {
        throw new Error(`duplicate portal ${portal.id}`)
      }
      if (!zones.has(portal.from) || !zones.has(portal.to)) {
        throw new Error(`portal ${portal.id} references a missing zone`)
      }
      portals.set(portal.id, portal)
    }
    for (const waypoint of options.waypoints ?? []) {
      if (waypoints.has(waypoint.id)) {
        throw new Error(`duplicate waypoint ${waypoint.id}`)
      }
      if (!zones.has(waypoint.zone)) {
        throw new Error(`waypoint ${waypoint.id} references a missing zone`)
      }
      waypoints.set(waypoint.id, waypoint)
    }
    this.zones = zones
    this.portals = portals
    this.waypoints = waypoints
  }

  connected(from: string, to: string): boolean {
    if (!this.zones.has(from) || !this.zones.has(to)) {
      return false
    }
    const seen = new Set<string>([from])
    const stack = [from]
    while (stack.length > 0) {
      const current = stack.pop() as string
      if (current === to) {
        return true
      }
      for (const portal of this.portals.values()) {
        const next = portal.from === current ? portal.to : portal.to === current && portal.bidirectional !== false ? portal.from : null
        if (next !== null && !seen.has(next)) {
          seen.add(next)
          stack.push(next)
        }
      }
    }
    return false
  }

  portalsFor(zone: string): readonly Portal[] {
    return [...this.portals.values()]
      .filter((portal) => portal.from === zone || (portal.to === zone && portal.bidirectional !== false))
      .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  }

  chunkCount(zone: string): number {
    const def = this.zones.get(zone)
    if (def === undefined) {
      return 0
    }
    return Math.ceil(def.bounds.width / def.chunkSize) * Math.ceil(def.bounds.height / def.chunkSize)
  }
}

export interface RoomTemplate {
  readonly id: string
  readonly width: number
  readonly height: number
  readonly seed: number
  readonly version: number
  readonly tags?: readonly string[]
}

export interface MapGenerator {
  generate(request: {
    readonly zone: ZoneDef
    readonly seed: number
    readonly version: number
  }): readonly RoomTemplate[]
}

export interface ZoneState {
  readonly current: string
  readonly loaded: readonly ChunkCoord[]
  readonly entities: Readonly<Record<string, number>>
  readonly seed: number
  readonly version: number
}

/** Runtime chunk/entity budget + portal switching; map generation is injected. */
export class ZoneRuntime {
  readonly graph: ZoneGraph
  private currentValue: string
  private readonly loadedSet = new Set<string>()
  private readonly entityCounts = new Map<string, number>()
  private seedValue: number
  private versionValue: number

  constructor(options: {
    readonly graph: ZoneGraph
    readonly start: string
    readonly seed: number
    readonly version: number
    readonly state?: ZoneState
  }) {
    if (!options.graph.zones.has(options.start)) {
      throw new Error(`unknown start zone ${options.start}`)
    }
    this.graph = options.graph
    this.currentValue = options.start
    this.seedValue = options.seed
    this.versionValue = options.version
    if (options.state !== undefined) {
      this.restore(options.state)
    }
  }

  get current(): string {
    return this.currentValue
  }

  get seed(): number {
    return this.seedValue
  }

  get version(): number {
    return this.versionValue
  }

  get loaded(): readonly ChunkCoord[] {
    return [...this.loadedSet]
      .map((key) => {
        const [zone, cx, cy] = key.split(':')
        return { zone: zone as string, cx: Number(cx), cy: Number(cy) }
      })
      .sort((left, right) =>
        left.zone < right.zone ? -1 : left.zone > right.zone ? 1 : left.cy - right.cy || left.cx - right.cx,
      )
  }

  entityCount(zone: string): number {
    return this.entityCounts.get(zone) ?? 0
  }

  loadChunk(chunk: ChunkCoord): boolean {
    const def = this.graph.zones.get(chunk.zone)
    if (def === undefined) {
      return false
    }
    if (!this.validChunk(def, chunk.cx, chunk.cy)) {
      return false
    }
    this.loadedSet.add(`${chunk.zone}:${chunk.cx}:${chunk.cy}`)
    return true
  }

  unloadChunk(chunk: ChunkCoord): void {
    this.loadedSet.delete(`${chunk.zone}:${chunk.cx}:${chunk.cy}`)
  }

  spawn(zone: string, count = 1): PortResult {
    const def = this.graph.zones.get(zone)
    if (def === undefined) {
      return { ok: false, reason: 'unknown_zone' }
    }
    if (!Number.isInteger(count) || count < 0) {
      return { ok: false, reason: 'budget' }
    }
    if (this.entityCount(zone) + count > def.spawnBudget) {
      return { ok: false, reason: 'budget' }
    }
    this.entityCounts.set(zone, this.entityCount(zone) + count)
    return { ok: true, zone }
  }

  despawn(zone: string, count = 1): void {
    this.entityCounts.set(zone, Math.max(0, this.entityCount(zone) - count))
  }

  usePortal(portalId: string): PortResult {
    const portal = this.graph.portals.get(portalId)
    if (portal === undefined) {
      return { ok: false, reason: 'unknown_portal' }
    }
    if (this.currentValue !== portal.from && !(portal.bidirectional !== false && this.currentValue === portal.to)) {
      return { ok: false, reason: 'not_connected' }
    }
    this.currentValue = this.currentValue === portal.from ? portal.to : portal.from
    return { ok: true, zone: this.currentValue }
  }

  generate(zone: string, generator: MapGenerator): readonly RoomTemplate[] {
    const def = this.graph.zones.get(zone)
    if (def === undefined) {
      return []
    }
    return generator.generate({ zone: def, seed: this.seedValue, version: this.versionValue })
  }

  serialize(): ZoneState {
    const entities: Record<string, number> = {}
    for (const [zone, count] of [...this.entityCounts.entries()].sort(([left], [right]) => left < right ? -1 : 1)) {
      entities[zone] = count
    }
    return {
      current: this.currentValue,
      loaded: this.loaded,
      entities,
      seed: this.seedValue,
      version: this.versionValue,
    }
  }

  restore(state: ZoneState): void {
    if (!this.graph.zones.has(state.current)) {
      throw new Error('invalid zone state')
    }
    this.currentValue = state.current
    this.seedValue = state.seed
    this.versionValue = state.version
    this.loadedSet.clear()
    for (const chunk of state.loaded) {
      this.loadChunk(chunk)
    }
    this.entityCounts.clear()
    for (const [zone, count] of Object.entries(state.entities)) {
      this.entityCounts.set(zone, count)
    }
  }

  private validChunk(def: ZoneDef, cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 &&
      cx < Math.ceil(def.bounds.width / def.chunkSize) &&
      cy < Math.ceil(def.bounds.height / def.chunkSize)
  }
}
