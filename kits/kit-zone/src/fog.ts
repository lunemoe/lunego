import type { ZoneGraph } from './zone.js'

export interface FogMarker {
  readonly id: string
  readonly zone: string
  readonly x: number
  readonly y: number
  readonly kind: string
}

export interface FogStateData {
  readonly explored: readonly string[]
  readonly markers: readonly FogMarker[]
}

function chunkKey(zone: string, cx: number, cy: number): string {
  return `${zone}:${cx}:${cy}`
}

/** Explored chunks and map markers; serializable without rendering state. */
export class FogState {
  private readonly exploredSet = new Set<string>()
  private readonly markerMap = new Map<string, FogMarker>()

  reveal(zone: string, cx: number, cy: number): void {
    this.exploredSet.add(chunkKey(zone, cx, cy))
  }

  isExplored(zone: string, cx: number, cy: number): boolean {
    return this.exploredSet.has(chunkKey(zone, cx, cy))
  }

  addMarker(marker: FogMarker): void {
    this.markerMap.set(marker.id, { ...marker })
  }

  removeMarker(id: string): void {
    this.markerMap.delete(id)
  }

  markers(): readonly FogMarker[] {
    return [...this.markerMap.values()].sort((left, right) =>
      left.zone < right.zone ? -1 : left.zone > right.zone ? 1 : left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    )
  }

  serialize(): FogStateData {
    return {
      explored: [...this.exploredSet].sort(),
      markers: this.markers().map((marker) => ({ ...marker })),
    }
  }

  restore(state: FogStateData): void {
    this.exploredSet.clear()
    this.markerMap.clear()
    for (const key of state.explored) {
      this.exploredSet.add(key)
    }
    for (const marker of state.markers) {
      this.markerMap.set(marker.id, { ...marker })
    }
  }
}

export interface MinimapSource {
  readonly width: number
  readonly height: number
  readonly graph: ZoneGraph
  project(zone: string, x: number, y: number): { readonly x: number; readonly y: number }
}

/** Projects zone world coordinates into minimap pixels using one graph scale. */
export function createMinimapSource(
  graph: ZoneGraph,
  options: { readonly width: number; readonly height: number; readonly padding?: number },
): MinimapSource {
  if (options.width <= 0 || options.height <= 0) {
    throw new Error('minimap dimensions must be positive')
  }
  const padding = options.padding ?? 0
  const zones = [...graph.zones.values()]
  const minX = Math.min(...zones.map((zone) => zone.bounds.x))
  const minY = Math.min(...zones.map((zone) => zone.bounds.y))
  const maxX = Math.max(...zones.map((zone) => zone.bounds.x + zone.bounds.width))
  const maxY = Math.max(...zones.map((zone) => zone.bounds.y + zone.bounds.height))
  const scaleX = (options.width - padding * 2) / Math.max(1, maxX - minX)
  const scaleY = (options.height - padding * 2) / Math.max(1, maxY - minY)
  return {
    width: options.width,
    height: options.height,
    graph,
    project(zone: string, x: number, y: number): { x: number; y: number } {
      const def = graph.zones.get(zone)
      if (def === undefined) {
        return { x: padding, y: padding }
      }
      return {
        x: padding + (def.bounds.x + x - minX) * scaleX,
        y: padding + (def.bounds.y + y - minY) * scaleY,
      }
    },
  }
}
