import { describe, expect, it } from 'vitest'
import {
  SpatialHash,
  blockedAabb,
  blockedCircle,
  blockedPoint,
  moveAabbOnGrid,
  moveCircleOnGrid,
  queryAabb,
  queryCircle,
} from '../index.js'

const grid = {
  width: 4,
  height: 3,
  tileSize: 10,
  solid: [0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0],
}

describe('collision grid', () => {
  it('tests points, circles and AABBs against solid tiles and bounds', () => {
    expect(blockedPoint(grid, 5, 5)).toBe(false)
    expect(blockedPoint(grid, 25, 5)).toBe(true)
    expect(blockedPoint(grid, -1, 5)).toBe(true)
    expect(blockedPoint({ ...grid, outsideSolid: false }, -1, 5)).toBe(false)
    expect(blockedCircle(grid, 25, 5, 4)).toBe(true)
    expect(blockedCircle(grid, 18, 5, 1.5)).toBe(false)
    expect(blockedCircle(grid, 5, 15, 6)).toBe(true)
    expect(blockedAabb(grid, 18, 8, 4, 4)).toBe(true)
    expect(blockedAabb(grid, 10, 0, 4, 4)).toBe(false)
  })

  it('slides each axis independently around walls', () => {
    expect(moveCircleOnGrid(grid, { x: 5, y: 5 }, 14, 0, 2)).toEqual({
      x: 5,
      y: 5,
      blockedX: true,
      blockedY: false,
    })
    expect(moveCircleOnGrid(grid, { x: 5, y: 5 }, 10, 10, 2)).toEqual({
      x: 15,
      y: 5,
      blockedX: false,
      blockedY: true,
    })
    expect(moveAabbOnGrid(grid, { x: 0, y: 0 }, 6, 6, 4, 4)).toEqual({
      x: 4,
      y: 4,
      blockedX: false,
      blockedY: false,
    })
  })
})

describe('spatial hash', () => {
  it('queries deterministically and updates/removes entries', () => {
    const hash = new SpatialHash<string>(10)
    hash.insert(3, { x: 0, y: 0, width: 4, height: 4 }, 'c')
    hash.insert(1, { x: 5, y: 0, width: 4, height: 4 }, 'a')
    hash.insert(2, { x: 50, y: 50, width: 4, height: 4 }, 'b')
    expect(hash.queryAabb({ x: -1, y: -1, width: 20, height: 10 }).map((e) => e.value)).toEqual([
      'a',
      'c',
    ])
    expect(hash.queryCircle(3, 3, 2).map((e) => e.id)).toEqual([3])
    hash.update(2, { x: 2, y: 2, width: 4, height: 4 })
    expect(hash.queryAabb({ x: 0, y: 0, width: 10, height: 10 }).map((e) => e.id)).toEqual([
      1,
      2,
      3,
    ])
    hash.remove(1)
    expect(hash.size).toBe(2)
    expect(hash.queryAabb({ x: 0, y: 0, width: 10, height: 10 }).map((e) => e.id)).toEqual([2, 3])
    hash.clear()
    expect(hash.size).toBe(0)
    expect(() => new SpatialHash(0)).toThrow(/cellSize/)
  })

  it('queries arbitrary lists with caller-provided bounds', () => {
    const items = [
      { id: 2, x: 2, y: 2, width: 4, height: 4 },
      { id: 1, x: 0, y: 0, width: 4, height: 4 },
      { id: 3, x: 40, y: 40, width: 4, height: 4 },
    ]
    const bounds = (item: (typeof items)[number]) => ({
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
    })
    expect(queryAabb(items, { x: 0, y: 0, width: 6, height: 6 }, bounds, (i) => i.id).map((i) => i.id)).toEqual([1, 2])
    expect(queryCircle(items, 3, 3, 2, bounds, (i) => i.id).map((i) => i.id)).toEqual([1, 2])
  })
})
