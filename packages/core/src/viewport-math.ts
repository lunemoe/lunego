import type { Vec2 } from './schema.js'

export interface CameraWorldOffset {
  readonly x: number
  readonly y: number
  readonly scale: number
}

function requirePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`)
  }
}

/** Virtual screen pixel for a world point; the single camera-rounding formula. */
export function worldToScreenPixel(
  worldX: number,
  worldY: number,
  cameraX: number,
  cameraY: number,
  zoom = 1,
  pixelSnap = true,
): Vec2 {
  requirePositive(zoom, 'zoom')
  const x = pixelSnap ? Math.round(worldX) : worldX
  const y = pixelSnap ? Math.round(worldY) : worldY
  return {
    x: Math.round(x * zoom - Math.round(cameraX * zoom)),
    y: Math.round(y * zoom - Math.round(cameraY * zoom)),
  }
}

/** Inverse mapping for a virtual screen pixel back to world coordinates. */
export function screenToWorldPoint(
  screenX: number,
  screenY: number,
  cameraX: number,
  cameraY: number,
  zoom = 1,
): Vec2 {
  requirePositive(zoom, 'zoom')
  const roundedX = Math.round(cameraX * zoom) / zoom
  const roundedY = Math.round(cameraY * zoom) / zoom
  return { x: roundedX + screenX / zoom, y: roundedY + screenY / zoom }
}

/** Transform applied to the Pixi world container for camera + zoom. */
export function cameraWorldOffset(
  cameraX: number,
  cameraY: number,
  zoom: number,
  pixelSnap = true,
): CameraWorldOffset {
  requirePositive(zoom, 'zoom')
  return {
    x: pixelSnap ? -Math.round(cameraX * zoom) : -cameraX * zoom,
    y: pixelSnap ? -Math.round(cameraY * zoom) : -cameraY * zoom,
    scale: zoom,
  }
}
