import { Application, Container, Graphics, TextureSource } from 'pixi.js'
import type { DisplaySpec, RenderAdapter, RenderLayer } from './types.js'
import { RENDER_LAYERS } from './types.js'

export interface PixiRendererOptions {
  readonly width: number
  readonly height: number
  readonly background: number
  readonly container: HTMLElement
}

/**
 * Pixi v8 is only a renderer: a fixed virtual resolution, nearest sampling,
 * integer CSS scaling, pixel-snapped camera and four world layers.
 */
export class PixiAdapter implements RenderAdapter<Container> {
  private readonly app: Application
  private readonly world: Container
  private readonly layers = new Map<RenderLayer, Container>()
  private readonly virtualWidth: number
  private readonly virtualHeight: number

  constructor(app: Application, options: PixiRendererOptions) {
    this.app = app
    this.virtualWidth = options.width
    this.virtualHeight = options.height
    this.world = new Container()
    this.app.stage.addChild(this.world)
    for (const layer of RENDER_LAYERS) {
      const container = new Container()
      container.sortableChildren = true
      this.layers.set(layer, container)
      this.world.addChild(container)
    }
    TextureSource.defaultOptions.scaleMode = 'nearest'
    app.canvas.style.imageRendering = 'pixelated'
    options.container.appendChild(app.canvas)
    this.fit(options.container)
    window.addEventListener('resize', () => this.fit(options.container))
  }

  get element(): HTMLCanvasElement {
    return this.app.canvas
  }

  create(spec: DisplaySpec): Container {
    const graphics = new Graphics()
    this.update(graphics, spec)
    return graphics
  }

  update(handle: Container, spec: DisplaySpec): void {
    if (!(handle instanceof Graphics)) {
      return
    }
    handle.clear()
    handle.rect(0, 0, spec.width, spec.height).fill(spec.color)
    handle.position.set(spec.x, spec.y)
    handle.visible = spec.visible
    handle.alpha = spec.alpha
  }

  destroy(handle: Container): void {
    handle.destroy()
  }

  attach(layer: RenderLayer, handle: Container): void {
    this.layers.get(layer)?.addChild(handle)
  }

  detach(handle: Container): void {
    handle.parent?.removeChild(handle)
  }

  order(layer: RenderLayer, handles: readonly Container[]): void {
    for (let index = 0; index < handles.length; index += 1) {
      handles[index].zIndex = index
    }
    this.layers.get(layer)?.sortChildren()
  }

  setCamera(x: number, y: number): void {
    this.world.x = -Math.round(x)
    this.world.y = -Math.round(y)
  }

  fit(container: HTMLElement): void {
    const availableWidth = container.clientWidth || this.virtualWidth
    const availableHeight = container.clientHeight || this.virtualHeight
    const scale = Math.max(
      1,
      Math.floor(Math.min(availableWidth / this.virtualWidth, availableHeight / this.virtualHeight)),
    )
    this.app.canvas.style.width = `${this.virtualWidth * scale}px`
    this.app.canvas.style.height = `${this.virtualHeight * scale}px`
  }

  dispose(): void {
    this.app.destroy(true)
  }
}

export async function createPixiRenderer(options: PixiRendererOptions): Promise<PixiAdapter> {
  const app = new Application()
  await app.init({
    width: options.width,
    height: options.height,
    background: options.background,
    antialias: false,
    autoDensity: false,
    resolution: 1,
    roundPixels: true,
    preserveDrawingBuffer: true,
  })
  return new PixiAdapter(app, options)
}
