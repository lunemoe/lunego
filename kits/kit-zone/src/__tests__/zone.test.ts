import { describe, expect, it } from 'vitest'
import {
  FogState,
  ZoneGraph,
  ZoneRuntime,
  createMinimapSource,
  type MapGenerator,
  type ZoneDef,
} from '../index.js'

const zones: readonly ZoneDef[] = [
  { id: 'town', bounds: { x: 0, y: 0, width: 64, height: 64 }, chunkSize: 16, spawnBudget: 4, biome: 'town' },
  { id: 'cave', bounds: { x: 100, y: 0, width: 32, height: 32 }, chunkSize: 16, spawnBudget: 2, biome: 'cave' },
]
const graph = new ZoneGraph({
  zones,
  portals: [
    { id: 'door', from: 'town', to: 'cave', fromPoint: { x: 60, y: 30 }, toPoint: { x: 5, y: 5 } },
  ],
  waypoints: [{ id: 'camp', zone: 'town', x: 1, y: 1 }],
})

describe('zone graph/runtime', () => {
  it('validates connectivity and dangling references', () => {
    expect(graph.connected('town', 'cave')).toBe(true)
    expect(graph.connected('cave', 'town')).toBe(true)
    expect(graph.portalsFor('town').map((portal) => portal.id)).toEqual(['door'])
    expect(graph.chunkCount('town')).toBe(16)
    expect(() => new ZoneGraph({
      zones,
      portals: [{ id: 'bad', from: 'town', to: 'missing', fromPoint: { x: 0, y: 0 }, toPoint: { x: 0, y: 0 } }],
    })).toThrow(/missing zone/)
    expect(() => new ZoneGraph({ zones, portals: [
      { id: 'a', from: 'town', to: 'cave', fromPoint: { x: 0, y: 0 }, toPoint: { x: 0, y: 0 } },
      { id: 'a', from: 'town', to: 'cave', fromPoint: { x: 0, y: 0 }, toPoint: { x: 0, y: 0 } },
    ] })).toThrow(/duplicate portal/)
  })

  it('loads bounded chunks, budgets entities and switches portals', () => {
    const runtime = new ZoneRuntime({ graph, start: 'town', seed: 3, version: 2 })
    expect(runtime.loadChunk({ zone: 'town', cx: 3, cy: 3 })).toBe(true)
    expect(runtime.loadChunk({ zone: 'town', cx: 4, cy: 3 })).toBe(false)
    expect(runtime.loadChunk({ zone: 'missing', cx: 0, cy: 0 })).toBe(false)
    expect(runtime.spawn('town', 3).ok).toBe(true)
    expect(runtime.spawn('town', 2)).toEqual({ ok: false, reason: 'budget' })
    expect(runtime.spawn('town', 1).ok).toBe(true)
    expect(runtime.usePortal('door')).toEqual({ ok: true, zone: 'cave' })
    expect(runtime.spawn('cave', 2).ok).toBe(true)
    expect(runtime.spawn('cave', 1)).toEqual({ ok: false, reason: 'budget' })
    expect(runtime.usePortal('missing')).toEqual({ ok: false, reason: 'unknown_portal' })
    const state = JSON.parse(JSON.stringify(runtime.serialize()))
    const restored = new ZoneRuntime({ graph, start: 'town', seed: 3, version: 2, state })
    expect(restored.serialize()).toEqual(runtime.serialize())
  })

  it('uses injected map generator seed/version and fog/minimap state', () => {
    const runtime = new ZoneRuntime({ graph, start: 'town', seed: 42, version: 7 })
    const generator: MapGenerator = {
      generate: ({ zone, seed, version }) => [{ id: `${zone.id}:${seed}:${version}`, width: 2, height: 2, seed, version }],
    }
    expect(runtime.generate('town', generator)[0]?.id).toBe('town:42:7')
    const fog = new FogState()
    fog.reveal('town', 0, 0)
    fog.reveal('cave', 1, 1)
    fog.addMarker({ id: 'b', zone: 'town', x: 1, y: 2, kind: 'poi' })
    fog.addMarker({ id: 'a', zone: 'town', x: 0, y: 0, kind: 'poi' })
    expect(fog.markers().map((marker) => marker.id)).toEqual(['a', 'b'])
    const restored = new FogState()
    restored.restore(JSON.parse(JSON.stringify(fog.serialize())))
    expect(restored.serialize()).toEqual(fog.serialize())
    expect(restored.isExplored('town', 0, 0)).toBe(true)

    const minimap = createMinimapSource(graph, { width: 100, height: 50, padding: 5 })
    const p = minimap.project('cave', 0, 0)
    expect(p.x).toBeGreaterThanOrEqual(5)
    expect(p.y).toBeGreaterThanOrEqual(5)
    expect(minimap.project('missing', 0, 0)).toEqual({ x: 5, y: 5 })
  })
})
