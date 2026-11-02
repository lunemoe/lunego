/** Create a canvas for runtime-generated textures without exposing document to games. */
export function createRuntimeCanvas(width: number, height: number): HTMLCanvasElement {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error('runtime canvas size must be positive integers')
  }
  if (typeof document === 'undefined') {
    throw new Error('createRuntimeCanvas requires a browser document')
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}
