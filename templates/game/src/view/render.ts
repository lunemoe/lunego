import {
  CameraController,
  RenderSystem,
  backgroundSpec,
  createPixiRenderer,
  createRuntimeCanvas,
  defineRenderBinding,
  rectSpec,
  spriteSpec,
} from '@lunego/render-pixi'
import { mountCanvasEffectSurface } from '@lunego/vfx'
import type { VfxSystem as VfxSystemType } from '@lunego/vfx'
import { ActorPosition } from '@lunego/kit-runtime'
import { Renderable } from '../../features/motion/schema.js'

export async function createDemoView(vfx: VfxSystemType) {  const renderer = await createPixiRenderer({
    width: 480,
    height: 270,
    background: 0x0b1018,
    container: '#game',
  })
  const surface = mountCanvasEffectSurface(vfx, '#game', {
    className: 'vfx-layer',
    alignTo: renderer.element,
  })

  const crate = createRuntimeCanvas(16, 16)
  const crateContext = crate.getContext('2d')
  if (crateContext !== null) {
    crateContext.fillStyle = '#d88a4a'
    crateContext.fillRect(0, 0, 16, 16)
    crateContext.fillStyle = '#a86232'
    crateContext.fillRect(0, 0, 16, 2)
    crateContext.fillRect(0, 14, 16, 2)
    crateContext.fillRect(0, 0, 2, 16)
    crateContext.fillRect(14, 0, 2, 16)
    crateContext.fillStyle = '#ffc27a'
    crateContext.fillRect(4, 4, 8, 2)
    crateContext.fillRect(4, 10, 8, 2)
    crateContext.fillStyle = '#7a3f1e'
    crateContext.fillRect(7, 6, 2, 4)
  }
  await renderer.textures.registerSource('runtime-crate', crate, { width: 16, height: 16 })

  const backdrop = createRuntimeCanvas(480, 270)
  const backdropContext = backdrop.getContext('2d')
  if (backdropContext !== null) {
    backdropContext.fillStyle = '#0b1018'
    backdropContext.fillRect(0, 0, 480, 270)
    backdropContext.fillStyle = '#0d141e'
    for (let y = 0; y < 270; y += 16) {
      for (let x = 0; x < 480; x += 16) {
        if ((x / 16 + y / 16) % 2 === 0) {
          backdropContext.fillRect(x, y, 16, 16)
        }
      }
    }
  }
  await renderer.textures.registerSource('runtime-backdrop', backdrop, { width: 480, height: 270 })
  renderer.setBackground(backgroundSpec({ color: 0x0b1018, texture: 'runtime-backdrop' }))

  const tileset = createRuntimeCanvas(32, 16)
  const tilesetContext = tileset.getContext('2d')
  if (tilesetContext !== null) {
    tilesetContext.fillStyle = '#1a2433'
    tilesetContext.fillRect(0, 0, 16, 16)
    tilesetContext.fillStyle = '#243a2a'
    tilesetContext.fillRect(16, 0, 16, 16)
    tilesetContext.fillStyle = '#31465a'
    tilesetContext.fillRect(2, 2, 12, 1)
    tilesetContext.fillRect(2, 13, 12, 1)
  }
  await renderer.textures.registerSource('runtime-tiles', tileset, { width: 32, height: 16 })
  renderer.setTilemap({
    tileset: { texture: 'runtime-tiles', tileWidth: 16, tileHeight: 16, columns: 2 },
    layers: [
      {
        name: 'floor',
        width: 30,
        height: 20,
        tiles: Array.from({ length: 30 * 20 }, (_, index) => (index % 2 === 0 ? 0 : 1)),
      },
    ],
  })

  const renderSystem = new RenderSystem(renderer)
  const camera = new CameraController({ width: 480, height: 270 })
  renderSystem.add(
    defineRenderBinding({
      query: [ActorPosition, Renderable],
      create: (view) => {
        const renderable = view.get(Renderable)
        if (renderable?.texture !== undefined) {
          return spriteSpec(renderable.texture, {
            width: renderable.width,
            height: renderable.height,
          })
        }
        return rectSpec(
          renderable?.width ?? 8,
          renderable?.height ?? 8,
          renderable?.color ?? 0xffffff,
        )
      },
      update: (object, view) => {
        const position = view.lerp(ActorPosition)
        const renderable = view.get(Renderable)
        object.x = position.x
        object.y = position.y
        if (object.kind !== 'rect') {
          if (renderable?.width !== undefined) object.width = renderable.width
          if (renderable?.height !== undefined) object.height = renderable.height
          return
        }
        object.width = renderable?.width ?? object.width
        object.height = renderable?.height ?? object.height
        object.color = renderable?.color ?? object.color
      },
    }),
  )

  return { renderer, surface, renderSystem, camera }
}
