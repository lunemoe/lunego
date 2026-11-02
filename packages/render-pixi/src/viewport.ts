export interface ViewportTransformInput {
  readonly cssWidth: number
  readonly virtualWidth: number
  readonly offsetX: number
  readonly offsetY: number
  readonly cameraX: number
  readonly cameraY: number
  readonly zoom: number
}

export interface ViewportTransform {
  readonly scale: number
  readonly offsetX: number
  readonly offsetY: number
  readonly cameraX: number
  readonly cameraY: number
}

/**
 * Shared screen -> world mapping. The Pixi camera rounds camera*zoom to whole
 * virtual pixels; pointer coordinates must use the same rounded camera divided
 * back by zoom, so a click lands exactly on the rendered pixel.
 */
export function viewportTransform(input: ViewportTransformInput): ViewportTransform {
  if (!Number.isFinite(input.zoom) || input.zoom <= 0) {
    throw new Error('viewport zoom must be positive')
  }
  if (!Number.isFinite(input.cssWidth) || input.cssWidth <= 0) {
    throw new Error('viewport cssWidth must be positive')
  }
  const cssPerVirtual = input.cssWidth / input.virtualWidth
  return {
    scale: cssPerVirtual * input.zoom,
    offsetX: input.offsetX,
    offsetY: input.offsetY,
    cameraX: Math.round(input.cameraX * input.zoom) / input.zoom,
    cameraY: Math.round(input.cameraY * input.zoom) / input.zoom,
  }
}
