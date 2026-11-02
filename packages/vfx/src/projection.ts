import { atan2 } from '@lunego/core/math'
import type { TopDownProjection } from './types.js'

export const DEFAULT_PROJECTION: TopDownProjection = {
  groundScaleY: 0.72,
  skewX: 0,
  footOffset: 0,
}

export interface ProjectedPoint {
  readonly x: number
  readonly y: number
}

/** Top-down ground plane: local art offsets are squashed vertically and slanted. */
export function projectGround(
  dx: number,
  dy: number,
  projection: TopDownProjection,
): ProjectedPoint {
  return {
    x: dx + dy * projection.skewX,
    y: dy * projection.groundScaleY,
  }
}

/** Screen-space facing angle for effects authored pointing along local +X. */
export function angleFromFacing(dx: number, dy: number): number {
  return atan2(dy, dx)
}

/**
 * Effects are authored around an art origin. Ground effects are anchored at the
 * entity's feet; front effects keep the same anchor and rise above it.
 */
export function anchorFor(
  x: number,
  y: number,
  projection: TopDownProjection,
): ProjectedPoint {
  return { x, y: y + projection.footOffset }
}
