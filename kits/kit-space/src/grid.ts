export interface CollisionGrid {
  readonly width: number
  readonly height: number
  readonly tileSize: number
  /** Row-major solid flags; any non-zero value is solid. */
  readonly solid: readonly number[] | Uint8Array
  /** Treat out-of-bounds cells as solid; default true. */
  readonly outsideSolid?: boolean
}

export interface Point {
  readonly x: number
  readonly y: number
}

export interface MoveResult {
  readonly x: number
  readonly y: number
  readonly blockedX: boolean
  readonly blockedY: boolean
}

function solidAt(grid: CollisionGrid, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= grid.width || ty >= grid.height) {
    return grid.outsideSolid ?? true
  }
  return grid.solid[ty * grid.width + tx] !== 0
}

function tileSpan(min: number, max: number, size: number): { readonly from: number; readonly to: number } {
  return { from: Math.floor(min / size), to: Math.floor(max / size) }
}

/** A point is blocked when its cell is solid. */
export function blockedPoint(grid: CollisionGrid, x: number, y: number): boolean {
  return solidAt(grid, Math.floor(x / grid.tileSize), Math.floor(y / grid.tileSize))
}

/** Exact circle vs solid tiles (nearest point on each candidate tile). */
export function blockedCircle(
  grid: CollisionGrid,
  x: number,
  y: number,
  radius: number,
): boolean {
  if (grid.width === 0 || grid.height === 0 || radius <= 0) {
    return blockedPoint(grid, x, y)
  }
  const size = grid.tileSize
  const spanX = tileSpan(x - radius, x + radius, size)
  const spanY = tileSpan(y - radius, y + radius, size)
  for (let ty = spanY.from; ty <= spanY.to; ty += 1) {
    for (let tx = spanX.from; tx <= spanX.to; tx += 1) {
      if (!solidAt(grid, tx, ty)) {
        continue
      }
      const left = tx * size
      const top = ty * size
      const nearestX = Math.max(left, Math.min(x, left + size))
      const nearestY = Math.max(top, Math.min(y, top + size))
      const dx = x - nearestX
      const dy = y - nearestY
      if (dx * dx + dy * dy < radius * radius) {
        return true
      }
    }
  }
  return false
}

/** AABB is {x,y} top-left plus size; any overlapping solid tile blocks it. */
export function blockedAabb(
  grid: CollisionGrid,
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  if (grid.width === 0 || grid.height === 0) {
    return false
  }
  const size = grid.tileSize
  const spanX = tileSpan(x, x + width, size)
  const spanY = tileSpan(y, y + height, size)
  for (let ty = spanY.from; ty <= spanY.to; ty += 1) {
    for (let tx = spanX.from; tx <= spanX.to; tx += 1) {
      if (!solidAt(grid, tx, ty)) {
        continue
      }
      const left = tx * size
      const top = ty * size
      if (x < left + size && x + width > left && y < top + size && y + height > top) {
        return true
      }
    }
  }
  return false
}

/** Axis-separated slide for a circular footprint. */
export function moveCircleOnGrid(
  grid: CollisionGrid,
  from: Point,
  dx: number,
  dy: number,
  radius: number,
): MoveResult {
  let x = from.x
  let y = from.y
  const blockedX = blockedCircle(grid, x + dx, y, radius)
  if (!blockedX) {
    x += dx
  }
  const blockedY = blockedCircle(grid, x, y + dy, radius)
  if (!blockedY) {
    y += dy
  }
  return { x, y, blockedX, blockedY }
}

/** Axis-separated slide for an AABB footprint. */
export function moveAabbOnGrid(
  grid: CollisionGrid,
  from: Point,
  width: number,
  height: number,
  dx: number,
  dy: number,
): MoveResult {
  let x = from.x
  let y = from.y
  const blockedX = blockedAabb(grid, x + dx, y, width, height)
  if (!blockedX) {
    x += dx
  }
  const blockedY = blockedAabb(grid, x, y + dy, width, height)
  if (!blockedY) {
    y += dy
  }
  return { x, y, blockedX, blockedY }
}
