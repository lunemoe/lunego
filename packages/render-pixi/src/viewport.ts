import { cameraWorldOffset, screenToWorldPoint, worldToScreenPixel } from '@lunego/core'
import type { Vec2 } from '@lunego/core'

export interface ViewportTransformInput {
  readonly cssWidth: number
  readonly virtualWidth: number
  readonly offsetX: number
  readonly offsetY: number
  readonly cameraX: number
  readonly cameraY: number
  readonly zoom: number
  readonly pixelSnap?: boolean
}

/**
 * One authoritative camera mapping for renderer, pointer input and effects.
 * `worldToScreen`/`screenToWorld` use virtual viewport pixels; CSS conversion
 * is expressed by `cssScale` plus `offsetX/offsetY`.
 */
export interface ViewportTransform {
  readonly cssScale: number
  /** CSS pixels per world pixel (cssScale * zoom), kept for older callers. */
  readonly scale: number
  readonly offsetX: number
  readonly offsetY: number
  readonly cameraX: number
  readonly cameraY: number
  readonly camera: Vec2
  readonly zoom: number
  readonly pixelSnap: boolean
  worldToScreen(worldX: number, worldY: number): Vec2
  screenToWorld(screenX: number, screenY: number): Vec2
}

function requirePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`)
  }
}

export function createViewportTransform(input: ViewportTransformInput): ViewportTransform {
  requirePositive(input.zoom, 'viewport zoom')
  requirePositive(input.cssWidth, 'viewport cssWidth')
  requirePositive(input.virtualWidth, 'viewport virtualWidth')
  const pixelSnap = input.pixelSnap ?? true
  const cssScale = input.cssWidth / input.virtualWidth
  const roundedCamera = screenToWorldPoint(0, 0, input.cameraX, input.cameraY, input.zoom)
  const cameraX = roundedCamera.x
  const cameraY = roundedCamera.y
  return {
    cssScale,
    scale: cssScale * input.zoom,
    offsetX: input.offsetX,
    offsetY: input.offsetY,
    cameraX,
    cameraY,
    camera: { x: cameraX, y: cameraY },
    zoom: input.zoom,
    pixelSnap,
    worldToScreen(worldX: number, worldY: number): Vec2 {
      return worldToScreenPixel(worldX, worldY, input.cameraX, input.cameraY, input.zoom, pixelSnap)
    },
    screenToWorld(screenX: number, screenY: number): Vec2 {
      return screenToWorldPoint(screenX, screenY, input.cameraX, input.cameraY, input.zoom)
    },
  }
}

export interface CameraWorldTransform {
  readonly x: number
  readonly y: number
  readonly scale: number
}

/** The exact transform applied to the Pixi world container. */
export function cameraWorldTransform(
  cameraX: number,
  cameraY: number,
  zoom: number,
  pixelSnap = true,
): CameraWorldTransform {
  requirePositive(zoom, 'camera zoom')
  const offset = cameraWorldOffset(cameraX, cameraY, zoom, pixelSnap)
  return { x: offset.x, y: offset.y, scale: offset.scale }
}

/** Backward-compatible alias for the old helper name. */
export function viewportTransform(input: ViewportTransformInput): ViewportTransform {
  return createViewportTransform(input)
}
