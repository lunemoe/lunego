import { Texture } from 'pixi.js'
import type { Graphics, Sprite } from 'pixi.js'
import type { FrameTextureCache } from './pixi-frames.js'
import type { TextureStore } from './textures.js'
import {
  animationFrameAt,
  type AnimatedDisplaySpec,
  type DisplayBounds,
  type EntityDisplaySpec,
  type RectDisplaySpec,
  type SpriteDisplaySpec,
  type SpriteFrame,
} from './types.js'

function snapped(value: number, pixelSnap: boolean): number {
  return pixelSnap ? Math.round(value) : value
}

export function measureDisplay(
  spec: EntityDisplaySpec,
  time: number,
  textures: TextureStore<Texture>,
): DisplayBounds {
  if (spec.kind === 'rect') {
    return measureBounds(spec, spec.width, spec.height)
  }
  const loaded = textures.get(spec.texture)
  const frame = spec.kind === 'animated'
    ? animatedFrame(spec, loaded?.frames, time)
    : spec.frame
  const width = spec.width ?? frame?.width ?? loaded?.width ?? 0
  const height = spec.height ?? frame?.height ?? loaded?.height ?? 0
  return measureBounds(spec, width, height)
}

export function updateGraphics(graphics: Graphics, spec: RectDisplaySpec): void {
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

export function updateSpriteDisplay(
  sprite: Sprite,
  spec: SpriteDisplaySpec | AnimatedDisplaySpec,
  time: number,
  textures: TextureStore<Texture>,
  frames: FrameTextureCache,
): void {
  const loaded = textures.get(spec.texture)
  const frame = spec.kind === 'animated'
    ? animatedFrame(spec, loaded?.frames, time)
    : spec.frame
  const texture = frame === undefined
    ? loaded?.texture
    : frames.get(spec.texture, frame, loaded?.texture)
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

function animatedFrame(
  spec: AnimatedDisplaySpec,
  registered: readonly SpriteFrame[] | undefined,
  time: number,
): SpriteFrame | undefined {
  return animationFrameAt(spec, spec.frames ?? registered ?? [], time)
}

function measureBounds(
  spec: EntityDisplaySpec,
  width: number,
  height: number,
): DisplayBounds {
  const anchorX = spec.anchorX ?? 0
  const anchorY = spec.anchorY ?? 0
  const snap = spec.pixelSnap ?? true
  const x = snap ? Math.round(spec.x - width * anchorX) : spec.x - width * anchorX
  const y = snap ? Math.round(spec.y - height * anchorY) : spec.y - height * anchorY
  return { x, y, width, height }
}
