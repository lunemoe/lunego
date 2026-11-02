import type { VfxSystem } from './system.js'

export interface CanvasSurfaceOptions {
  readonly pixelated?: boolean
}

/** Transparent 2D canvas overlay for the composited effect buffers. */
export class CanvasEffectSurface {
  private readonly system: VfxSystem
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private readonly image: ImageData
  private destroyed = false

  constructor(system: VfxSystem, canvas: HTMLCanvasElement, options: CanvasSurfaceOptions = {}) {
    const context = canvas.getContext('2d')
    if (context === null) {
      throw new Error('vfx canvas has no 2d context')
    }
    this.system = system
    this.canvas = canvas
    this.context = context
    this.canvas.width = system.width
    this.canvas.height = system.height
    if (options.pixelated ?? true) {
      this.canvas.style.imageRendering = 'pixelated'
    }
    this.image = context.createImageData(system.width, system.height)
  }

  get element(): HTMLCanvasElement {
    return this.canvas
  }

  render(cameraX = 0, cameraY = 0, zoom = 1): void {
    if (this.destroyed) {
      return
    }
    this.system.composeAll(this.image, cameraX, cameraY, zoom)
    this.context.putImageData(this.image, 0, 0)
  }

  destroy(): void {
    if (this.destroyed) {
      return
    }
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.destroyed = true
  }
}
