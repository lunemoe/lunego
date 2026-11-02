import { atan2 } from '@lunego/core/math'
import { cameraWorldOffset, worldToScreenPixel } from '@lunego/core'
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

export interface ScreenPoint {
  readonly x: number
  readonly y: number
}

/**
 * World -> virtual viewport pixel for effect anchors. Render-pixi rounds both
 * entity world positions and camera*zoom; use the same rounding so effects and
 * actors land on the same pixel.
 */
export function effectScreenPosition(
  worldX: number,
  worldY: number,
  cameraX: number,
  cameraY: number,
  zoom = 1,
): ScreenPoint {
  if (!Number.isFinite(zoom) || zoom <= 0) {
    throw new Error('effect zoom must be positive')
  }
  return worldToScreenPixel(worldX, worldY, cameraX, cameraY, zoom)
}

/** Inverse transform for a screen-space buffer sprite inside a zoomed world. */
export function effectLayerTransform(
  cameraX: number,
  cameraY: number,
  zoom: number,
  width: number,
  height: number,
): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  if (!Number.isFinite(zoom) || zoom <= 0) {
    throw new Error('effect zoom must be positive')
  }
  const offset = cameraWorldOffset(cameraX, cameraY, zoom)
  return {
    x: -offset.x / zoom,
    y: -offset.y / zoom,
    width: width / zoom,
    height: height / zoom,
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
