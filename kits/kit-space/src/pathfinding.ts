import type { CollisionGrid } from './grid.js'

export interface TilePoint {
  readonly x: number
  readonly y: number
}

export type Path = readonly TilePoint[]

export interface AStarOptions {
  readonly diagonal?: boolean
  readonly maxNodes?: number
  readonly maxExpanded?: number
  /** Allow diagonal moves past a blocked orthogonal corner; default false. */
  readonly cornerCutting?: boolean
}

interface SearchNode {
  readonly x: number
  readonly y: number
  readonly g: number
  readonly f: number
  readonly h: number
  readonly index: number
  readonly parent: SearchNode | null
}

function solidAt(grid: CollisionGrid, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) {
    return grid.outsideSolid ?? true
  }
  return grid.solid[y * grid.width + x] !== 0
}

function indexOf(grid: CollisionGrid, point: TilePoint): number {
  return point.y * grid.width + point.x
}

function heuristic(left: TilePoint, right: TilePoint, diagonal: boolean): number {
  const dx = Math.abs(left.x - right.x)
  const dy = Math.abs(left.y - right.y)
  if (!diagonal) {
    return (dx + dy) * 10
  }
  return (dx + dy) * 10 + (Math.min(dx, dy) * 4)
}

/** Min-heap ordered by f, then h, then tile index. */
class NodeHeap {
  private readonly items: SearchNode[] = []

  get size(): number {
    return this.items.length
  }

  push(node: SearchNode): void {
    this.items.push(node)
    let index = this.items.length - 1
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (!this.before(this.items[index], this.items[parent])) {
        break
      }
      const swap = this.items[parent]
      this.items[parent] = this.items[index]
      this.items[index] = swap
      index = parent
    }
  }

  pop(): SearchNode | undefined {
    const first = this.items[0]
    const last = this.items.pop()
    if (last === undefined || this.items.length === 0) {
      return first
    }
    this.items[0] = last
    let index = 0
    for (;;) {
      const left = index * 2 + 1
      const right = left + 1
      let smallest = index
      if (left < this.items.length && this.before(this.items[left], this.items[smallest])) {
        smallest = left
      }
      if (right < this.items.length && this.before(this.items[right], this.items[smallest])) {
        smallest = right
      }
      if (smallest === index) {
        break
      }
      const swap = this.items[smallest]
      this.items[smallest] = this.items[index]
      this.items[index] = swap
      index = smallest
    }
    return first
  }

  private before(left: SearchNode | undefined, right: SearchNode | undefined): boolean {
    if (left === undefined) {
      return false
    }
    if (right === undefined) {
      return true
    }
    return left.f < right.f ||
      (left.f === right.f && left.h < right.h) ||
      (left.f === right.f && left.h === right.h && left.index < right.index)
  }
}

interface Direction {
  readonly dx: number
  readonly dy: number
  readonly diagonal: boolean
}

const CARDINALS: readonly Direction[] = [
  { dx: 0, dy: -1, diagonal: false },
  { dx: 1, dy: 0, diagonal: false },
  { dx: 0, dy: 1, diagonal: false },
  { dx: -1, dy: 0, diagonal: false },
]
const DIAGONALS: readonly Direction[] = [
  { dx: -1, dy: -1, diagonal: true },
  { dx: 1, dy: -1, diagonal: true },
  { dx: 1, dy: 1, diagonal: true },
  { dx: -1, dy: 1, diagonal: true },
]

function reconstruct(node: SearchNode): Path {
  const path: TilePoint[] = []
  let current: SearchNode | null = node
  while (current !== null) {
    path.push({ x: current.x, y: current.y })
    current = current.parent
  }
  return path.reverse()
}

/**
 * Deterministic 2D tile A*. Costs are integer cardinal=10/diagonal=14 so the
 * result does not depend on floating point or locale. Budget exhaustion returns
 * null rather than a partial path.
 */
export function gridAStar(
  grid: CollisionGrid,
  from: TilePoint,
  to: TilePoint,
  options: AStarOptions = {},
): Path | null {
  if (grid.width <= 0 || grid.height <= 0) {
    return null
  }
  if (
    from.x < 0 || from.y < 0 || from.x >= grid.width || from.y >= grid.height ||
    to.x < 0 || to.y < 0 || to.x >= grid.width || to.y >= grid.height
  ) {
    return null
  }
  if (solidAt(grid, from.x, from.y) || solidAt(grid, to.x, to.y)) {
    return null
  }
  if (from.x === to.x && from.y === to.y) {
    return [{ x: from.x, y: from.y }]
  }
  const diagonal = options.diagonal ?? true
  const maxExpanded = options.maxExpanded ?? Number.POSITIVE_INFINITY
  const maxNodes = options.maxNodes ?? Number.POSITIVE_INFINITY
  const directions = diagonal ? [...CARDINALS, ...DIAGONALS] : CARDINALS
  const heap = new NodeHeap()
  const best = new Map<number, number>()
  let expanded = 0
  let visited = 0
  const startIndex = indexOf(grid, from)
  const targetIndex = indexOf(grid, to)
  heap.push({
    x: from.x,
    y: from.y,
    g: 0,
    h: heuristic(from, to, diagonal),
    f: heuristic(from, to, diagonal),
    index: startIndex,
    parent: null,
  })
  best.set(startIndex, 0)

  while (heap.size > 0) {
    const current = heap.pop()
    if (current === undefined) {
      break
    }
    const known = best.get(current.index)
    if (known !== undefined && current.g > known) {
      continue
    }
    if (current.index === targetIndex) {
      return reconstruct(current)
    }
    expanded += 1
    if (expanded > maxExpanded) {
      return null
    }
    for (const direction of directions) {
      const x = current.x + direction.dx
      const y = current.y + direction.dy
      if (x < 0 || y < 0 || x >= grid.width || y >= grid.height || solidAt(grid, x, y)) {
        continue
      }
      if (
        direction.diagonal &&
        options.cornerCutting !== true &&
        (solidAt(grid, current.x + direction.dx, current.y) ||
          solidAt(grid, current.x, current.y + direction.dy))
      ) {
        continue
      }
      const index = y * grid.width + x
      const cost = current.g + (direction.diagonal ? 14 : 10)
      const previous = best.get(index)
      if (previous !== undefined && previous <= cost) {
        continue
      }
      visited += 1
      if (visited > maxNodes) {
        return null
      }
      best.set(index, cost)
      const h = heuristic({ x, y }, to, diagonal)
      heap.push({ x, y, g: cost, h, f: cost + h, index, parent: current })
    }
  }
  return null
}

export interface FlowFieldOptions {
  readonly maxNodes?: number
}

export interface FlowField {
  readonly width: number
  readonly height: number
  /** Integer distance: goals=0, unreachable=-1, otherwise steps+1. */
  readonly distances: Int32Array
  distance(tile: TilePoint): number
  /** Next tile toward the nearest goal, or null at a goal/unreachable tile. */
  next(tile: TilePoint): TilePoint | null
}

const FLOW_DIRECTIONS: readonly TilePoint[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
]

/** Multi-goal BFS integer flow field; goals are deduplicated by tile index. */
export function flowField(
  grid: CollisionGrid,
  goals: readonly TilePoint[],
  options: FlowFieldOptions = {},
): FlowField | null {
  if (grid.width <= 0 || grid.height <= 0) {
    return null
  }
  const distances = new Int32Array(grid.width * grid.height).fill(-1)
  const queue: number[] = []
  const seenGoals = new Set<number>()
  for (const goal of [...goals].sort((left, right) => indexOf(grid, left) - indexOf(grid, right))) {
    if (
      goal.x < 0 || goal.y < 0 || goal.x >= grid.width || goal.y >= grid.height ||
      solidAt(grid, goal.x, goal.y)
    ) {
      continue
    }
    const index = indexOf(grid, goal)
    if (seenGoals.has(index)) {
      continue
    }
    seenGoals.add(index)
    distances[index] = 0
    queue.push(index)
  }
  const maxNodes = options.maxNodes ?? Number.POSITIVE_INFINITY
  let head = 0
  let expanded = 0
  while (head < queue.length) {
    if (expanded > maxNodes) {
      return null
    }
    expanded += 1
    const index = queue[head]
    head += 1
    const x = index % grid.width
    const y = Math.floor(index / grid.width)
    for (const direction of FLOW_DIRECTIONS) {
      const nx = x + direction.x
      const ny = y + direction.y
      if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height || solidAt(grid, nx, ny)) {
        continue
      }
      if (direction.x !== 0 && direction.y !== 0) {
        if (solidAt(grid, x + direction.x, y) || solidAt(grid, x, y + direction.y)) {
          continue
        }
      }
      const nextIndex = ny * grid.width + nx
      if (distances[nextIndex] !== -1) {
        continue
      }
      distances[nextIndex] = distances[index] + 1
      queue.push(nextIndex)
    }
  }

  const distance = (tile: TilePoint): number => {
    if (tile.x < 0 || tile.y < 0 || tile.x >= grid.width || tile.y >= grid.height) {
      return -1
    }
    return distances[indexOf(grid, tile)]
  }
  const next = (tile: TilePoint): TilePoint | null => {
    const current = distance(tile)
    if (current <= 0) {
      return null
    }
    for (const direction of FLOW_DIRECTIONS) {
      const candidate = { x: tile.x + direction.x, y: tile.y + direction.y }
      if (distance(candidate) === current - 1) {
        return candidate
      }
    }
    return null
  }
  return { width: grid.width, height: grid.height, distances, distance, next }
}
