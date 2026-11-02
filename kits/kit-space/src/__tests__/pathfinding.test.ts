import { describe, expect, it } from 'vitest'
import { flowField, gridAStar, type CollisionGrid } from '../index.js'

function grid(width: number, height: number, walls: readonly number[] = []): CollisionGrid {
  const solid = new Uint8Array(width * height)
  for (const index of walls) {
    solid[index] = 1
  }
  return { width, height, tileSize: 16, solid }
}

describe('grid A*', () => {
  it('finds a deterministic path with stable tie-breaking', () => {
    const map = grid(5, 5)
    const path = gridAStar(map, { x: 0, y: 0 }, { x: 4, y: 4 }, { diagonal: true })
    expect(path).not.toBeNull()
    expect(path?.[0]).toEqual({ x: 0, y: 0 })
    expect(path?.at(-1)).toEqual({ x: 4, y: 4 })
    expect(path).toHaveLength(5)
    expect(gridAStar(map, { x: 0, y: 0 }, { x: 4, y: 4 }, { diagonal: true })).toEqual(path)
  })

  it('routes around walls and returns null when unreachable', () => {
    const map = grid(5, 5, [2])
    const path = gridAStar(map, { x: 0, y: 0 }, { x: 4, y: 0 }, { diagonal: false })
    expect(path).not.toBeNull()
    expect(path?.some((tile) => tile.y === 1)).toBe(true)
    const sealed = grid(3, 3, [1, 3, 5, 7])
    expect(gridAStar(sealed, { x: 0, y: 0 }, { x: 2, y: 2 }, { diagonal: false })).toBeNull()
  })

  it('does not cut blocked diagonal corners unless requested', () => {
    const map = grid(3, 3, [1, 3])
    const blocked = gridAStar(map, { x: 0, y: 0 }, { x: 1, y: 1 }, { diagonal: true })
    expect(blocked).toBeNull()
    const cut = gridAStar(map, { x: 0, y: 0 }, { x: 1, y: 1 }, {
      diagonal: true,
      cornerCutting: true,
    })
    expect(cut).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }])
  })

  it('returns null on expansion/node budgets', () => {
    const map = grid(8, 8)
    expect(gridAStar(map, { x: 0, y: 0 }, { x: 7, y: 7 }, { maxExpanded: 1 })).toBeNull()
    expect(gridAStar(map, { x: 0, y: 0 }, { x: 7, y: 7 }, { maxNodes: 1 })).toBeNull()
    expect(gridAStar(map, { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual([{ x: 0, y: 0 }])
  })
})

describe('flow field', () => {
  it('builds BFS distances, next steps and handles walls/unreachable', () => {
    const map = grid(5, 5, [2])
    const field = flowField(map, [{ x: 0, y: 0 }])
    expect(field).not.toBeNull()
    expect(field?.distance({ x: 0, y: 0 })).toBe(0)
    expect(field?.distance({ x: 4, y: 0 })).toBe(4)
    expect(field?.distance({ x: 0, y: 4 })).toBe(4)
    expect(field?.next({ x: 4, y: 0 })).toEqual({ x: 3, y: 1 })
    expect(field?.next({ x: 0, y: 0 })).toBeNull()
    expect(flowField(map, [{ x: 2, y: 2 }], { maxNodes: 1 })).toBeNull()
  })

  it('deduplicates goals and is deterministic', () => {
    const map = grid(4, 4)
    const a = flowField(map, [{ x: 3, y: 3 }, { x: 3, y: 3 }])
    const b = flowField(map, [{ x: 3, y: 3 }])
    expect([...a!.distances]).toEqual([...b!.distances])
    expect(a?.next({ x: 0, y: 0 })).toEqual({ x: 1, y: 1 })
  })
})
