import { Assets, Texture } from 'pixi.js'
import type { TextureLoader, TextureLoadResult, TextureSource } from './textures.js'

export class PixiTextureLoader implements TextureLoader<Texture> {
  async load(source: TextureSource): Promise<TextureLoadResult<Texture>> {
    const texture = typeof source === 'string'
      ? await Assets.load<Texture>(source)
      : Texture.from(source)
    return { texture, width: texture.width, height: texture.height }
  }

  dispose(texture: Texture): void {
    texture.destroy(true)
  }
}
