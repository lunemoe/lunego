export interface Aabb {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface SpatialEntry<T> {
  readonly id: number
  readonly aabb: Aabb
  readonly value: T
}

function overlaps(left: Aabb, right: Aabb): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  )
}

function circleOverlapsAabb(x: number, y: number, radius: number, box: Aabb): boolean {
  const nearestX = Math.max(box.x, Math.min(x, box.x + box.width))
  const nearestY = Math.max(box.y, Math.min(y, box.y + box.height))
  const dx = x - nearestX
  const dy = y - nearestY
  return dx * dx + dy * dy < radius * radius
}

/**
 * Uniform spatial hash broadphase. Queries deduplicate hits and return numeric
 * ids in ascending order, so iteration never depends on insertion order.
 */
export class SpatialHash<T> {
  private readonly cellSize: number
  private readonly cells = new Map<string, Set<number>>()
  private readonly entries = new Map<number, SpatialEntry<T>>()

  constructor(cellSize: number) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
      throw new Error('spatial hash cellSize must be positive')
    }
    this.cellSize = cellSize
  }

  get size(): number {
    return this.entries.size
  }

  insert(id: number, aabb: Aabb, value: T): void {
    if (this.entries.has(id)) {
      this.remove(id)
    }
    this.entries.set(id, { id, aabb, value })
    for (const key of this.keysFor(aabb)) {
      const bucket = this.cells.get(key)
      if (bucket === undefined) {
        this.cells.set(key, new Set([id]))
      } else {
        bucket.add(id)
      }
    }
  }

  update(id: number, aabb: Aabb, value?: T): void {
    const existing = this.entries.get(id)
    if (existing === undefined) {
      if (value === undefined) {
        throw new Error(`spatial hash entry ${id} does not exist`)
      }
      this.insert(id, aabb, value)
      return
    }
    this.insert(id, aabb, value ?? existing.value)
  }

  remove(id: number): void {
    const entry = this.entries.get(id)
    if (entry === undefined) {
      return
    }
    for (const key of this.keysFor(entry.aabb)) {
      const bucket = this.cells.get(key)
      if (bucket === undefined) {
        continue
      }
      bucket.delete(id)
      if (bucket.size === 0) {
        this.cells.delete(key)
      }
    }
    this.entries.delete(id)
  }

  queryAabb(box: Aabb): readonly SpatialEntry<T>[] {
    return this.collect(this.keysFor(box)).filter((entry) => overlaps(entry.aabb, box))
  }

  queryCircle(x: number, y: number, radius: number): readonly SpatialEntry<T>[] {
    const box: Aabb = { x: x - radius, y: y - radius, width: radius * 2, height: radius * 2 }
    return this.collect(this.keysFor(box)).filter((entry) =>
      circleOverlapsAabb(x, y, radius, entry.aabb),
    )
  }

  clear(): void {
    this.cells.clear()
    this.entries.clear()
  }

  private collect(keys: readonly string[]): SpatialEntry<T>[] {
    const ids = new Set<number>()
    for (const key of keys) {
      const bucket = this.cells.get(key)
      if (bucket === undefined) {
        continue
      }
      for (const id of bucket) {
        ids.add(id)
      }
    }
    return [...ids]
      .sort((left, right) => left - right)
      .map((id) => this.entries.get(id))
      .filter((entry): entry is SpatialEntry<T> => entry !== undefined)
  }

  private keysFor(box: Aabb): string[] {
    const minX = Math.floor(box.x / this.cellSize)
    const maxX = Math.floor((box.x + box.width) / this.cellSize)
    const minY = Math.floor(box.y / this.cellSize)
    const maxY = Math.floor((box.y + box.height) / this.cellSize)
    const keys: string[] = []
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        keys.push(`${x}:${y}`)
      }
    }
    return keys
  }
}

/** Rectangle query over an arbitrary list with caller-provided bounds. */
export function queryAabb<T>(
  items: readonly T[],
  box: Aabb,
  bounds: (item: T) => Aabb,
  key: (item: T) => number,
): T[] {
  return items
    .filter((item) => overlaps(bounds(item), box))
    .sort((left, right) => key(left) - key(right))
}

/** Circle query over an arbitrary list with caller-provided bounds. */
export function queryCircle<T>(
  items: readonly T[],
  x: number,
  y: number,
  radius: number,
  bounds: (item: T) => Aabb,
  key: (item: T) => number,
): T[] {
  return items
    .filter((item) => circleOverlapsAabb(x, y, radius, bounds(item)))
    .sort((left, right) => key(left) - key(right))
}
