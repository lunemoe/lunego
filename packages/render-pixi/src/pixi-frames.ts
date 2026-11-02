import { Rectangle, Texture } from 'pixi.js'
import type { SpriteFrame } from './types.js'

/** Caches sub-textures cut from a spritesheet/tileset by frame rect. */
export class FrameTextureCache {
  private readonly textures = new Map<string, Texture>()

  get(id: string, frame: SpriteFrame, base: Texture | undefined): Texture | undefined {
    if (base === undefined) {
      return undefined
    }
    const key = `${id}:${frame.x}:${frame.y}:${frame.width}:${frame.height}`
    const cached = this.textures.get(key)
    if (cached !== undefined) {
      return cached
    }
    const texture = new Texture({
      source: base.source,
      frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
    })
    this.textures.set(key, texture)
    return texture
  }

  clear(): void {
    for (const texture of this.textures.values()) {
      texture.destroy()
    }
    this.textures.clear()
  }
}
