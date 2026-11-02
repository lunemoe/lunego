import type { VfxSystem } from './system.js'

export interface CanvasSurfaceOptions {
  readonly pixelated?: boolean
  readonly className?: string
  /** Canvas whose CSS size/offset the overlay should follow. */
  readonly alignTo?: HTMLElement
}

/** Transparent 2D canvas overlay for the composited effect buffers. */
export class CanvasEffectSurface {
  private readonly system: VfxSystem
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private readonly image: ImageData
  private readonly alignTo: HTMLElement | undefined
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
    this.alignTo = options.alignTo
    if (options.className !== undefined) {
      this.canvas.className = options.className
    }
    this.align()
  }

  get element(): HTMLCanvasElement {
    return this.canvas
  }

  render(cameraX = 0, cameraY = 0, zoom = 1): void {
    if (this.destroyed) {
      return
    }
    this.align()
    this.system.composeAll(this.image, cameraX, cameraY, zoom)
    this.context.putImageData(this.image, 0, 0)
  }

  private align(): void {
    const target = this.alignTo
    if (target === undefined) {
      return
    }
    const width = target.style.width.length > 0 ? target.style.width : `${target.clientWidth}px`
    const height = target.style.height.length > 0 ? target.style.height : `${target.clientHeight}px`
    this.canvas.style.width = width
    this.canvas.style.height = height
    this.canvas.style.left = `${target.offsetLeft}px`
    this.canvas.style.top = `${target.offsetTop}px`
  }

  destroy(): void {
    if (this.destroyed) {
      return
    }
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.destroyed = true
  }
}

/** Create the overlay canvas inside a container; games never touch document. */
export function mountCanvasEffectSurface(
  system: VfxSystem,
  container: string | HTMLElement,
  options: CanvasSurfaceOptions = {},
): CanvasEffectSurface {
  if (typeof document === 'undefined') {
    throw new Error('mountCanvasEffectSurface requires a browser document')
  }
  const host = typeof container === 'string'
    ? document.querySelector<HTMLElement>(container)
    : container
  if (host === null) {
    throw new Error(`vfx canvas container ${String(container)} was not found`)
  }
  const canvas = document.createElement('canvas')
  canvas.className = options.className ?? 'vfx-layer'
  host.appendChild(canvas)
  return new CanvasEffectSurface(system, canvas, options)
}
