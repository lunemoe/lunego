import { describe, expect, it } from 'vitest'
import {
  TilemapView,
  buildTilemap,
  cameraTransform,
  tileFrame,
  type TileInstance,
} from '../tilemap.js'

const tileset = { texture: 'ground', tileWidth: 16, tileHeight: 16, columns: 4, margin: 1, spacing: 2 }

describe('tilemap layout', () => {
  it('builds layered tiles with origin, gaps and empty cells skipped', () => {
    const instances = buildTilemap({
      tileset,
      originX: 32,
      originY: 8,
      layers: [
        { name: 'ground', width: 3, height: 2, tiles: [0, 1, -1, 4, 5, 6] },
        { name: 'overhang', width: 1, height: 1, tiles: [2], layer: 'foreground' },
      ],
    })
    expect(instances).toHaveLength(6)
    const first = instances[0]
    expect(first).toMatchObject({
      key: 'ground:0:0',
      layer: 'tiles',
      x: 32,
      y: 8,
      frame: { x: 1, y: 1, width: 16, height: 16 },
    })
    expect(instances[1]?.x).toBe(48)
    expect(instances[2]?.key).toBe('ground:1:0')
    expect(instances[2]?.frame.y).toBe(1 + 16 + 2)
    expect(instances[5]?.layer).toBe('foreground')
  })

  it('rejects malformed layer data', () => {
    expect(() =>
      buildTilemap({
        tileset,
        layers: [{ name: 'bad', width: 2, height: 2, tiles: [0] }],
      }),
    ).toThrow(/expected 4/)
    expect(() => tileFrame({ ...tileset, columns: 0 }, 0)).not.toThrow()
  })

  it('computes camera/zoom transforms in scaled world units', () => {
    expect(cameraTransform(10, 20, 2)).toEqual({ x: -20, y: -40, scale: 2 })
    expect(cameraTransform(10.4, 20.6, 2.5)).toEqual({ x: -26, y: -52, scale: 2.5 })
    expect(cameraTransform(10, 20, 1, false)).toEqual({ x: -10, y: -20, scale: 1 })
    expect(() => cameraTransform(0, 0, 0)).toThrow(/zoom/)
  })
})

describe('tilemap lifecycle', () => {
  it('destroys old handles when a map is replaced or cleared', () => {
    const created: TileInstance[] = []
    const destroyed: TileInstance[] = []
    const view = new TilemapView<TileInstance>({
      create: (instance) => {
        created.push(instance)
        return instance
      },
      destroy: (handle) => destroyed.push(handle),
    })
    view.setMap({
      tileset,
      layers: [{ name: 'ground', width: 2, height: 1, tiles: [0, 1] }],
    })
    expect(view.count).toBe(2)
    view.setMap({
      tileset,
      layers: [{ name: 'ground', width: 1, height: 1, tiles: [3] }],
    })
    expect(view.count).toBe(1)
    expect(created).toHaveLength(3)
    expect(destroyed.map((tile) => tile.key)).toEqual(['ground:0:0', 'ground:0:1'])
    view.clear()
    expect(view.count).toBe(0)
    expect(destroyed).toHaveLength(3)
    view.destroy()
    expect(() =>
      view.setMap({ tileset, layers: [{ name: 'ground', width: 1, height: 1, tiles: [0] }] }),
    ).toThrow(/destroyed/)
  })
})
