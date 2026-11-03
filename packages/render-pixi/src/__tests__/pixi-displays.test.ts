import { Sprite, Texture } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { measureDisplay, updateSpriteDisplay } from '../pixi-displays.js'
import { FrameTextureCache } from '../pixi-frames.js'
import { TextureStore } from '../textures.js'
import { spriteSpec } from '../types.js'

describe('Pixi sprite anchor placement', () => {
  it.each([
    { anchorX: 0, anchorY: 0, pixelSnap: true },
    { anchorX: 0.5, anchorY: 0.5, pixelSnap: true },
    { anchorX: 0.5, anchorY: 1, pixelSnap: true },
    { anchorX: 0.25, anchorY: 1, pixelSnap: false },
    { anchorX: 0, anchorY: 1, pixelSnap: true, flipX: true },
    { anchorX: 0.25, anchorY: 1, pixelSnap: false, flipX: true, flipY: true },
  ])('aligns painted bounds with measured bounds for $anchorX,$anchorY (snap $pixelSnap)', (options) => {
    const textures = new TextureStore<Texture>({
      load: () => Promise.resolve({ texture: Texture.EMPTY, width: 16, height: 24 }),
      dispose: () => undefined,
    })
    textures.register('actor', Texture.EMPTY, { width: 16, height: 24 })
    const spec = spriteSpec('actor', { ...options, width: 15, height: 23 })
    spec.x = 100.4
    spec.y = 100.7
    const sprite = new Sprite()
    const frames = new FrameTextureCache()
    updateSpriteDisplay(sprite, spec, 0, textures, frames)
    const painted = sprite.getBounds()
    expect({ x: painted.x, y: painted.y, width: painted.width, height: painted.height })
      .toEqual(measureDisplay(spec, 0, textures))
    sprite.destroy()
    frames.clear()
    textures.destroy()
  })
})
