import type { Frame } from '@lunego/core'
import { Sprite, Texture } from 'pixi.js'
import type { Container } from 'pixi.js'
import type { CueEffectMap, VfxSystem } from './system.js'
import type { EffectLayer } from './types.js'
import { effectLayerTransform } from './projection.js'
import { composite } from '../vendor/pixelfx/src/core/index.js'

export interface PixiEffectContainers {
  /** Usually render-pixi's `tiles` layer: floor effects sit behind actors. */
  readonly ground?: Container
  /** Usually render-pixi's `foreground` layer: effects cover actors. */
  readonly front?: Container
}

interface LayerSurface {
  readonly canvas: HTMLCanvasElement
  readonly context: CanvasRenderingContext2D
  readonly image: ImageData
  readonly sprite: Sprite
  readonly texture: Texture
}

function createSurface(width: number, height: number, container: Container): LayerSurface {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context === null) {
    throw new Error('vfx pixi layer has no 2d context')
  }
  const texture = Texture.from(canvas)
  const sprite = new Sprite(texture)
  sprite.zIndex = 1_000_000
  container.addChild(sprite)
  return { canvas, context, image: context.createImageData(width, height), sprite, texture }
}

/**
 * Renders the two effect layers as full-screen sprites inside layers owned by
 * render-pixi. Effects are depth-sorted inside VfxSystem; the containers
 * decide whether they sit behind tiles/entities or in the foreground.
 */
export class PixiEffectRenderer {
  private readonly system: VfxSystem
  private readonly surfaces: Partial<Record<EffectLayer, LayerSurface>> = {}
  private destroyed = false

  constructor(system: VfxSystem, containers: PixiEffectContainers) {
    this.system = system
    if (containers.ground !== undefined) {
      this.surfaces.ground = createSurface(system.width, system.height, containers.ground)
    }
    if (containers.front !== undefined) {
      this.surfaces.front = createSurface(system.width, system.height, containers.front)
    }
  }

  /** Plays cues, then redraws both screen-space buffers under the render-pixi camera. */
  sync(
    frame: Frame,
    map: CueEffectMap,
    cameraX: number,
    cameraY: number,
    zoom = 1,
  ): void {
    if (this.destroyed) {
      return
    }
    this.system.consume(frame, map)
    this.draw('ground', cameraX, cameraY, zoom)
    this.draw('front', cameraX, cameraY, zoom)
  }

  destroy(): void {
    if (this.destroyed) {
      return
    }
    for (const surface of Object.values(this.surfaces)) {
      if (surface === undefined) {
        continue
      }
      surface.sprite.destroy()
      surface.texture.destroy()
    }
    this.destroyed = true
  }

  private draw(
    layer: 'ground' | 'front',
    cameraX: number,
    cameraY: number,
    zoom: number,
  ): void {
    const surface = this.surfaces[layer]
    if (surface === undefined) {
      return
    }
    composite(this.system.compose(layer, cameraX, cameraY, zoom), surface.image.data, null)
    surface.context.putImageData(surface.image, 0, 0)
    const transform = effectLayerTransform(
      cameraX,
      cameraY,
      zoom,
      this.system.width,
      this.system.height,
    )
    surface.sprite.position.set(transform.x, transform.y)
    surface.sprite.width = transform.width
    surface.sprite.height = transform.height
    surface.texture.source.update()
  }
}
