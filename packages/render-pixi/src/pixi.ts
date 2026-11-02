import {
  Application,
  Container,
  Graphics,
  Sprite,
  Texture,
  TextureSource as PixiTextureSource,
} from 'pixi.js'
import type {
  AnimatedDisplaySpec,
  BackgroundDisplaySpec,
  EntityDisplaySpec,
  RectDisplaySpec,
  RenderAdapter,
  RenderLayer,
  SpriteDisplaySpec,
  SpriteFrame,
} from './types.js'
import {
  animationFrameAt,
  RENDER_LAYERS,
} from './types.js'
import { TextureStore, type TextureManifest } from './textures.js'
import {
  TilemapView,
  cameraTransform,
  type TileInstance,
  type TilemapDefinition,
} from './tilemap.js'
import { PixiTextureLoader } from './pixi-textures.js'
import { FrameTextureCache } from './pixi-frames.js'

export interface PixiRendererOptions {
  readonly width: number
  readonly height: number
  readonly background?: number
  readonly container: HTMLElement
  readonly textures?: TextureStore<Texture>
  readonly manifest?: TextureManifest
  readonly ownsTextures?: boolean
  /** Whether dispose() should destroy the injected Pixi Application. */
  readonly ownsApp?: boolean
}

function snapped(value: number, pixelSnap: boolean): number {
  return pixelSnap ? Math.round(value) : value
}

/**
 * Pixi v8 is only a renderer: a fixed virtual resolution, nearest sampling,
 * integer CSS scaling, pixel-snapped camera and four world layers. Sprites and
 * animations are display data; no game rules live here.
 */
export class PixiAdapter implements RenderAdapter<Container> {
  readonly textures: TextureStore<Texture>
  private readonly app: Application
  private readonly world: Container
  private readonly backgroundLayer: Container
  private readonly backgroundFill = new Graphics()
  private readonly backgroundImage = new Sprite()
  private readonly layers = new Map<RenderLayer, Container>()
  private readonly frameTextures = new FrameTextureCache()
  private readonly virtualWidth: number
  private readonly virtualHeight: number
  private readonly ownsTextures: boolean
  private readonly ownsApp: boolean
  private readonly resizeHandler: () => void
  private disposed = false
  private backgroundValue: BackgroundDisplaySpec | null = null
  private tilemapValue: TilemapView<Sprite> | null = null
  private tilemapDefinition: TilemapDefinition | null = null
  private zoomValue = 1
  private cameraX = 0
  private cameraY = 0

  constructor(app: Application, options: PixiRendererOptions) {
    this.app = app
    this.virtualWidth = options.width
    this.virtualHeight = options.height
    this.textures = options.textures ?? new TextureStore(new PixiTextureLoader())
    this.ownsTextures = options.ownsTextures ?? options.textures === undefined
    this.ownsApp = options.ownsApp ?? false
    this.backgroundLayer = new Container()
    this.backgroundLayer.addChild(this.backgroundFill, this.backgroundImage)
    this.app.stage.addChild(this.backgroundLayer)
    this.world = new Container()
    this.app.stage.addChild(this.world)
    for (const layer of RENDER_LAYERS) {
      const container = new Container()
      container.sortableChildren = true
      this.layers.set(layer, container)
      this.world.addChild(container)
    }
    PixiTextureSource.defaultOptions.scaleMode = 'nearest'
    app.canvas.style.imageRendering = 'pixelated'
    options.container.appendChild(app.canvas)
    this.fit(options.container)
    this.resizeHandler = () => this.fit(options.container)
    window.addEventListener('resize', this.resizeHandler)
    if (options.background !== undefined) {
      this.setBackground({ kind: 'background', color: options.background })
    }
  }

  get element(): HTMLCanvasElement {
    return this.app.canvas
  }

  get stage(): Container {
    return this.app.stage
  }

  get worldContainer(): Container {
    return this.world
  }

  get background(): Container {
    return this.backgroundLayer
  }

  get tilemap(): TilemapView<Sprite> | null {
    return this.tilemapValue
  }

  get zoom(): number {
    return this.zoomValue
  }

  layerContainer(layer: RenderLayer): Container | undefined {
    return this.layers.get(layer)
  }

  setBackground(spec: BackgroundDisplaySpec | null): void {
    this.backgroundValue = spec
    this.renderBackground()
  }

  setTilemap(definition: TilemapDefinition | null): void {
    this.tilemapDefinition = definition
    this.rebuildTilemap()
  }

  /** Retry after a manifest finishes loading. */
  refreshTilemap(): void {
    this.rebuildTilemap()
  }

  setZoom(zoom: number): void {
    if (!Number.isFinite(zoom) || zoom <= 0) {
      throw new Error('zoom must be a positive finite number')
    }
    this.zoomValue = zoom
    this.applyCamera()
  }

  clearBackground(): void {
    this.setBackground(null)
  }

  create(spec: EntityDisplaySpec): Container {
    if (spec.kind === 'rect') {
      const graphics = new Graphics()
      graphics.label = 'rect'
      this.update(graphics, spec)
      return graphics
    }
    const sprite = new Sprite()
    sprite.label = spec.kind
    this.update(sprite, spec)
    return sprite
  }

  update(handle: Container, spec: EntityDisplaySpec, time = 0): void {
    if (handle instanceof Graphics) {
      this.updateRect(handle, spec as RectDisplaySpec)
      return
    }
    if (handle instanceof Sprite && (spec.kind === 'sprite' || spec.kind === 'animated')) {
      this.updateSprite(handle, spec, time)
    }
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
    this.cameraX = x
    this.cameraY = y
    this.applyCamera()
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
    if (this.disposed) {
      return
    }
    this.disposed = true
    window.removeEventListener('resize', this.resizeHandler)
    this.tilemapValue?.destroy()
    this.tilemapValue = null
    this.tilemapDefinition = null
    this.frameTextures.clear()
    if (this.ownsTextures) {
      this.textures.destroy()
    }
    if (this.ownsApp) {
      this.app.destroy(true)
      return
    }
    this.app.stage.removeChild(this.backgroundLayer, this.world)
    this.backgroundLayer.destroy({ children: true })
    this.world.destroy({ children: true })
  }

  private updateRect(graphics: Graphics, spec: RectDisplaySpec): void {
    const anchorX = spec.anchorX ?? 0
    const anchorY = spec.anchorY ?? 0
    graphics.clear()
    graphics.rect(0, 0, spec.width, spec.height).fill(spec.color)
    graphics.position.set(
      snapped(spec.x - spec.width * anchorX, spec.pixelSnap ?? true),
      snapped(spec.y - spec.height * anchorY, spec.pixelSnap ?? true),
    )
    graphics.visible = spec.visible
    graphics.alpha = spec.alpha
  }

  private updateSprite(
    sprite: Sprite,
    spec: SpriteDisplaySpec | AnimatedDisplaySpec,
    time: number,
  ): void {
    const loaded = this.textures.get(spec.texture)
    const frame = spec.kind === 'animated' ? this.animatedFrame(spec, loaded?.frames, time) : spec.frame
    const texture = frame === undefined
      ? loaded?.texture
      : this.frameTextures.get(spec.texture, frame, loaded?.texture)
    if (texture === undefined) {
      sprite.texture = Texture.EMPTY
      sprite.visible = false
      return
    }
    sprite.texture = texture
    const width = spec.width ?? frame?.width ?? loaded?.width ?? texture.width
    const height = spec.height ?? frame?.height ?? loaded?.height ?? texture.height
    sprite.width = width
    sprite.height = height
    sprite.scale.x = Math.abs(sprite.scale.x) * (spec.flipX === true ? -1 : 1)
    sprite.scale.y = Math.abs(sprite.scale.y) * (spec.flipY === true ? -1 : 1)
    sprite.anchor.set(spec.anchorX ?? 0, spec.anchorY ?? 0)
    sprite.position.set(
      snapped(spec.x - width * (spec.anchorX ?? 0), spec.pixelSnap ?? true),
      snapped(spec.y - height * (spec.anchorY ?? 0), spec.pixelSnap ?? true),
    )
    sprite.tint = spec.tint ?? 0xffffff
    sprite.alpha = spec.alpha
    sprite.visible = spec.visible
  }

  private animatedFrame(
    spec: AnimatedDisplaySpec,
    registered: readonly SpriteFrame[] | undefined,
    time: number,
  ): SpriteFrame | undefined {
    return animationFrameAt(spec, spec.frames ?? registered ?? [], time)
  }

  private applyCamera(): void {
    const transform = cameraTransform(this.cameraX, this.cameraY, this.zoomValue)
    this.world.scale.set(transform.scale)
    this.world.position.set(transform.x, transform.y)
  }

  private rebuildTilemap(): void {
    this.tilemapValue?.destroy()
    this.tilemapValue = null
    const definition = this.tilemapDefinition
    if (definition === null) {
      return
    }
    const loaded = this.textures.get(definition.tileset.texture)
    if (loaded === undefined) {
      return
    }
    this.tilemapValue = new TilemapView<Sprite>({
      create: (instance: TileInstance) =>
        this.createTile(instance, loaded.texture, definition.tileset.texture),
      destroy: (sprite: Sprite) => {
        sprite.parent?.removeChild(sprite)
        sprite.destroy()
      },
    })
    this.tilemapValue.setMap(definition)
  }

  private createTile(instance: TileInstance, base: Texture, textureId: string): Sprite {
    const texture = this.frameTextures.get(`${textureId}:${instance.index}`, instance.frame, base)
    const sprite = new Sprite(texture ?? Texture.EMPTY)
    sprite.position.set(instance.x, instance.y)
    sprite.width = instance.width
    sprite.height = instance.height
    sprite.visible = this.tilemapDefinition?.layers.find(
      (layer) => layer.name === instance.layerName,
    )?.visible ?? true
    const container = this.layers.get(instance.layer)
    container?.addChild(sprite)
    return sprite
  }

  private renderBackground(): void {
    const spec = this.backgroundValue
    this.backgroundFill.clear()
    this.backgroundImage.texture = Texture.EMPTY
    this.backgroundImage.visible = false
    if (spec === null) {
      return
    }
    const alpha = spec.alpha ?? 1
    if (spec.color !== undefined) {
      this.backgroundFill
        .rect(0, 0, this.virtualWidth, this.virtualHeight)
        .fill({ color: spec.color, alpha })
    }
    if (spec.texture !== undefined) {
      const loaded = this.textures.get(spec.texture)
      if (loaded !== undefined) {
        this.backgroundImage.texture = loaded.texture
        this.backgroundImage.width = this.virtualWidth
        this.backgroundImage.height = this.virtualHeight
        this.backgroundImage.tint = spec.tint ?? 0xffffff
        this.backgroundImage.alpha = alpha
        this.backgroundImage.visible = true
      }
    }
  }
}

export async function createPixiRenderer(options: PixiRendererOptions): Promise<PixiAdapter> {
  const textures = options.textures ?? new TextureStore(new PixiTextureLoader())
  if (options.manifest !== undefined) {
    await textures.loadManifest(options.manifest)
  }
  const app = new Application()
  await app.init({
    width: options.width,
    height: options.height,
    background: options.background ?? 0x000000,
    antialias: false,
    autoDensity: false,
    resolution: 1,
    roundPixels: true,
    preserveDrawingBuffer: true,
  })
  return new PixiAdapter(app, {
    ...options,
    textures,
    ownsTextures: options.ownsTextures ?? options.textures === undefined,
    ownsApp: options.ownsApp ?? true,
  })
}
