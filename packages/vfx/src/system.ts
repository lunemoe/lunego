import type { CueInstance, Frame } from '@lunego/core'
import * as pixelFx from '../vendor/pixelfx/src/core/index.js'
import {
  DEFAULT_PROJECTION,
  anchorFor,
  projectGround,
  type ProjectedPoint,
} from './projection.js'
import type {
  CueResolver,
  EffectInstance,
  EffectLayer,
  EffectModule,
  EffectRequest,
  PixelFrame,
  TopDownProjection,
} from './types.js'

export interface VfxConfig {
  readonly width: number
  readonly height: number
  readonly maxEffects?: number
  readonly projection?: Partial<TopDownProjection>
}

interface ActiveEffect {
  readonly id: string
  readonly module: EffectModule
  readonly instance: EffectInstance
  readonly frame: PixelFrame
  readonly x: number
  readonly y: number
  readonly scale: number
  readonly layer: EffectLayer
  readonly depth: number
  readonly order: number
}

class FramePool {
  private readonly free = new Map<string, PixelFrame[]>()

  acquire(width: number, height: number): PixelFrame {
    const key = `${width}x${height}`
    const bucket = this.free.get(key)
    const reused = bucket?.pop()
    if (reused !== undefined) {
      return reused
    }
    return pixelFx.createFrame(width, height) as PixelFrame
  }

  release(frame: PixelFrame): void {
    const key = `${frame.w}x${frame.h}`
    const bucket = this.free.get(key)
    if (bucket === undefined) {
      this.free.set(key, [frame])
    } else {
      bucket.push(frame)
    }
  }

  clear(): void {
    this.free.clear()
  }
}

interface CueRuleEntry {
  readonly resolve: CueResolver
}

/** Maps replicated Cue names to view effects. The logic layer never sees this table. */
export class CueEffectMap {
  private readonly rules = new Map<string, CueRuleEntry>()

  add(name: string, resolve: CueResolver): this {
    if (this.rules.has(name)) {
      throw new Error(`cue ${name} already has an effect mapping`)
    }
    this.rules.set(name, { resolve })
    return this
  }

  resolve(cue: CueInstance): readonly EffectRequest[] {
    return this.rules.get(cue.type)?.resolve(cue) ?? []
  }
}

export function defineCueMap(
  rules: Readonly<Record<string, CueResolver>>,
): CueEffectMap {
  const map = new CueEffectMap()
  for (const name of Object.keys(rules)) {
    map.add(name, rules[name])
  }
  return map
}

function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

function clearFrame(frame: PixelFrame): void {
  frame.color.fill(0)
  frame.light.fill(0)
}

function blendPixel(
  scene: PixelFrame,
  x: number,
  y: number,
  color: number,
  light: number,
): void {
  if (x < 0 || y < 0 || x >= scene.w || y >= scene.h) {
    return
  }
  const index = y * scene.w + x
  if (color !== 0) {
    const alpha = (color >>> 24) / 255
    if (alpha >= 1) {
      scene.color[index] = color
    } else if (alpha > 0) {
      const dst = scene.color[index]
      const inv = 1 - alpha
      const dr = dst & 0xff
      const dg = (dst >>> 8) & 0xff
      const db = (dst >>> 16) & 0xff
      const da = (dst >>> 24) & 0xff
      const r = ((color & 0xff) * alpha + dr * inv) | 0
      const g = (((color >>> 8) & 0xff) * alpha + dg * inv) | 0
      const b = (((color >>> 16) & 0xff) * alpha + db * inv) | 0
      const a = Math.min(255, (alpha * 255 + (da * inv)) | 0)
      scene.color[index] = (a << 24) | (b << 16) | (g << 8) | r
    }
  }
  if (light !== 0) {
    const dst = scene.light[index]
    const r = Math.min(255, (dst & 0xff) + (light & 0xff))
    const g = Math.min(255, ((dst >>> 8) & 0xff) + ((light >>> 8) & 0xff))
    const b = Math.min(255, ((dst >>> 16) & 0xff) + ((light >>> 16) & 0xff))
    scene.light[index] = (255 << 24) | (b << 16) | (g << 8) | r
  }
}

/**
 * Cue-driven pixelfx player. It owns no game rules: callers hand it cues and
 * effect requests, and it exposes composited pixel buffers for a renderer.
 */
export class VfxSystem {
  readonly width: number
  readonly height: number
  readonly maxEffects: number
  private projection: TopDownProjection
  private readonly framePool = new FramePool()
  private readonly active: ActiveEffect[] = []
  private readonly sceneFrames = new Map<EffectLayer | 'combined', PixelFrame>()
  private nextOrder = 0
  private lastFrameTick = -1
  private destroyed = false

  constructor(config: VfxConfig) {
    if (!Number.isInteger(config.width) || config.width <= 0) {
      throw new Error('vfx width must be a positive integer')
    }
    if (!Number.isInteger(config.height) || config.height <= 0) {
      throw new Error('vfx height must be a positive integer')
    }
    this.width = config.width
    this.height = config.height
    this.maxEffects = config.maxEffects ?? 128
    if (!Number.isInteger(this.maxEffects) || this.maxEffects < 1) {
      throw new Error('vfx maxEffects must be a positive integer')
    }
    this.projection = { ...DEFAULT_PROJECTION, ...config.projection }
  }

  get effectCount(): number {
    return this.active.length
  }

  get isDestroyed(): boolean {
    return this.destroyed
  }

  setProjection(projection: Partial<TopDownProjection>): void {
    this.projection = { ...this.projection, ...projection }
  }

  play(request: EffectRequest): string {
    if (this.destroyed) {
      throw new Error('vfx system is destroyed')
    }
    const meta = request.effect.meta
    const frame = this.framePool.acquire(meta.size[0], meta.size[1])
    clearFrame(frame)
    const options: Record<string, unknown> = {
      ...(meta.options ?? {}),
      ...(request.options ?? {}),
      x: meta.origin[0],
      y: meta.origin[1],
      angle: request.angle ?? 0,
      flip: request.flip ?? false,
      seed: request.seed ?? 1,
      ...(request.palette === undefined ? {} : { palette: request.palette }),
      ...(request.light === undefined ? {} : { light: request.light }),
    }
    const instance = pixelFx.createFx(request.effect, options) as EffectInstance
    const id = `${request.seed ?? 1}:${this.nextOrder}`
    this.active.push({
      id,
      module: request.effect,
      instance,
      frame,
      x: request.x,
      y: request.y,
      scale: request.scale ?? 1,
      layer: request.layer ?? 'front',
      depth: request.y,
      order: this.nextOrder,
    })
    this.nextOrder += 1
    while (this.active.length > this.maxEffects) {
      const dropped = this.active.shift()
      if (dropped !== undefined) {
        this.framePool.release(dropped.frame)
      }
    }
    return id
  }

  /** Plays every cue in a frame through the view's mapping. */
  consume(frame: Frame, map: CueEffectMap): void {
    if (frame.tick <= this.lastFrameTick) {
      return
    }
    this.lastFrameTick = frame.tick
    for (const cue of frame.cues) {
      const requests = map.resolve(cue)
      for (let index = 0; index < requests.length; index += 1) {
        const request = requests[index]
        this.play({
          ...request,
          seed: request.seed ?? hashString(`${cue.id}:${index}`),
        })
      }
    }
  }

  update(dt: number): void {
    if (!Number.isFinite(dt) || dt < 0) {
      throw new Error('vfx dt must be a non-negative finite number')
    }
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const effect = this.active[index]
      effect.instance.update(dt)
      if (effect.instance.done()) {
        this.framePool.release(effect.frame)
        this.active.splice(index, 1)
      }
    }
  }

  /** Composited world-space pixels for one render layer. */
  compose(layer: EffectLayer, cameraX = 0, cameraY = 0): PixelFrame {
    const scene = this.sceneFrame(layer)
    clearFrame(scene)
    const effects = this.active
      .filter((effect) => effect.layer === layer)
      .sort((left, right) => left.depth - right.depth || left.order - right.order)
    for (const effect of effects) {
      this.drawEffect(effect, scene, cameraX, cameraY)
    }
    return scene
  }

  /** Ground then front into a single RGBA buffer for a simple canvas overlay. */
  composeAll(out: ImageData, cameraX = 0, cameraY = 0): void {
    if (out.width !== this.width || out.height !== this.height) {
      throw new Error('vfx ImageData size does not match the system')
    }
    const scene = this.sceneFrame('combined')
    clearFrame(scene)
    const effects = [...this.active].sort(
      (left, right) => left.depth - right.depth || left.order - right.order,
    )
    for (const layer of ['ground', 'front'] as const) {
      for (const effect of effects) {
        if (effect.layer === layer) {
          this.drawEffect(effect, scene, cameraX, cameraY)
        }
      }
    }
    pixelFx.composite(scene, out.data, null)
  }

  destroy(): void {
    if (this.destroyed) {
      return
    }
    for (const effect of this.active) {
      effect.instance.stop()
    }
    this.active.length = 0
    this.framePool.clear()
    this.sceneFrames.clear()
    this.lastFrameTick = -1
    this.destroyed = true
  }

  private sceneFrame(layer: EffectLayer | 'combined'): PixelFrame {
    const existing = this.sceneFrames.get(layer)
    if (existing !== undefined) {
      return existing
    }
    const frame = pixelFx.createFrame(this.width, this.height) as PixelFrame
    this.sceneFrames.set(layer, frame)
    return frame
  }

  private drawEffect(
    effect: ActiveEffect,
    scene: PixelFrame,
    cameraX: number,
    cameraY: number,
  ): void {
    const frame = effect.frame
    clearFrame(frame)
    effect.instance.draw(frame, 'back')
    effect.instance.draw(frame, 'front')
    const meta = effect.module.meta
    const originX = meta.origin[0]
    const originY = meta.origin[1]
    const anchor: ProjectedPoint = anchorFor(effect.x, effect.y, this.projection)
    const ground = effect.layer === 'ground'
    for (let y = 0; y < frame.h; y += 1) {
      for (let x = 0; x < frame.w; x += 1) {
        const index = y * frame.w + x
        const color = frame.color[index]
        const light = frame.light[index]
        if (color === 0 && light === 0) {
          continue
        }
        const dx = (x - originX) * effect.scale
        const dy = (y - originY) * effect.scale
        const projected = ground ? projectGround(dx, dy, this.projection) : { x: dx, y: dy }
        blendPixel(
          scene,
          Math.round(anchor.x + projected.x - cameraX),
          Math.round(anchor.y + projected.y - cameraY),
          color,
          light,
        )
      }
    }
  }
}
