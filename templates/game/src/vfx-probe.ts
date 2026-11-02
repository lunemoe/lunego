import {
  CanvasEffectSurface,
  VfxSystem,
  defineCueMap,
  effectScreenPosition,
  type EffectModule,
} from '@lunego/vfx'
import { PixiEffectRenderer } from '@lunego/vfx/pixi'
import { createPixiRenderer } from '@lunego/render-pixi'
import type { Frame } from '@lunego/core'

const probeEffect: EffectModule = {
  meta: { name: 'Probe', size: [1, 1], origin: [0, 0], duration: 1 },
  create: () => ({
    draw(painter) {
      ;(painter as { px(x: number, y: number, color: number): void }).px(0, 0, 0xffffffff)
    },
  }),
}

export interface VfxProbeResult {
  readonly expectedX: number
  readonly expectedY: number
  readonly alpha: number
}

export function probe(
  worldX: number,
  worldY: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
): VfxProbeResult {
  const system = new VfxSystem({ width: 480, height: 270 })
  system.play({ effect: probeEffect, x: worldX, y: worldY })
  const canvas = document.createElement('canvas')
  canvas.style.position = 'fixed'
  canvas.style.left = '-1000px'
  document.body.appendChild(canvas)
  const surface = new CanvasEffectSurface(system, canvas)
  surface.render(cameraX, cameraY, zoom)
  const context = canvas.getContext('2d')
  if (context === null) {
    throw new Error('probe canvas has no context')
  }
  const expected = effectScreenPosition(worldX, worldY, cameraX, cameraY, zoom)
  const alpha = context.getImageData(expected.x, expected.y, 1, 1).data[3] ?? 0
  surface.destroy()
  system.destroy()
  canvas.remove()
  return { expectedX: expected.x, expectedY: expected.y, alpha }
}

type Renderer = Awaited<ReturnType<typeof createPixiRenderer>>

export interface PixiProbeResult {
  readonly expectedX: number
  readonly expectedY: number
}

class PixiProbe {
  private renderer: Renderer | null = null
  private effects: PixiEffectRenderer | null = null
  private system: VfxSystem | null = null
  private host: HTMLElement | null = null

  async probe(
    worldX: number,
    worldY: number,
    cameraX: number,
    cameraY: number,
    zoom: number,
  ): Promise<PixiProbeResult> {
    this.cleanup()
    const host = document.createElement('div')
    host.id = 'pixi-coord'
    host.style.position = 'fixed'
    host.style.left = '0'
    host.style.top = '0'
    host.style.width = '480px'
    host.style.height = '270px'
    document.body.appendChild(host)
    this.host = host
    this.renderer = await createPixiRenderer({ width: 480, height: 270, container: host })
    this.system = new VfxSystem({ width: 480, height: 270 })
    this.system.play({ effect: probeEffect, x: worldX, y: worldY })
    const front = this.renderer.layerContainer('foreground')
    if (front === undefined) {
      throw new Error('missing foreground layer')
    }
    this.effects = new PixiEffectRenderer(this.system, { front })
    this.renderer.setCamera(cameraX, cameraY)
    this.renderer.setZoom(zoom)
    const frame: Frame = { tick: 0, events: [], cues: [], modelPatches: [] }
    this.effects.sync(frame, defineCueMap({}), cameraX, cameraY, zoom)
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    const expected = effectScreenPosition(worldX, worldY, cameraX, cameraY, zoom)
    return { expectedX: expected.x, expectedY: expected.y }
  }

  async probeLayer(layer: 'ground' | 'front'): Promise<{
    readonly ownX: number
    readonly ownY: number
    readonly otherX: number
    readonly otherY: number
  }> {
    this.cleanup()
    const host = document.createElement('div')
    host.id = 'pixi-layer'
    host.style.position = 'fixed'
    host.style.left = '0'
    host.style.top = '300px'
    host.style.width = '480px'
    host.style.height = '270px'
    document.body.appendChild(host)
    this.host = host
    this.renderer = await createPixiRenderer({ width: 480, height: 270, container: host })
    this.system = new VfxSystem({ width: 480, height: 270 })
    this.system.play({ effect: probeEffect, x: 100, y: 80, layer: 'ground' })
    this.system.play({ effect: probeEffect, x: 200, y: 120, layer: 'front' })
    const renderLayer = layer === 'ground' ? 'tiles' : 'foreground'
    const container = this.renderer.layerContainer(renderLayer)
    if (container === undefined) {
      throw new Error(`missing ${renderLayer} layer`)
    }
    this.effects = new PixiEffectRenderer(
      this.system,
      layer === 'ground' ? { ground: container } : { front: container },
    )
    this.renderer.setCamera(10.4, 7.7)
    this.renderer.setZoom(1)
    const frame: Frame = { tick: 0, events: [], cues: [], modelPatches: [] }
    this.effects.sync(frame, defineCueMap({}), 10.4, 7.7, 1)
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    const ground = effectScreenPosition(100, 80, 10.4, 7.7, 1)
    const front = effectScreenPosition(200, 120, 10.4, 7.7, 1)
    return {
      ownX: layer === 'ground' ? ground.x : front.x,
      ownY: layer === 'ground' ? ground.y : front.y,
      otherX: layer === 'ground' ? front.x : ground.x,
      otherY: layer === 'ground' ? front.y : ground.y,
    }
  }

  cleanup(): void {
    this.effects?.destroy()
    this.effects = null
    this.system?.destroy()
    this.system = null
    this.renderer?.dispose()
    this.renderer = null
    this.host?.remove()
    this.host = null
  }
}

const pixiProbe = new PixiProbe()

export function probePixi(
  worldX: number,
  worldY: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
): Promise<PixiProbeResult> {
  return pixiProbe.probe(worldX, worldY, cameraX, cameraY, zoom)
}

export function probePixiLayer(layer: 'ground' | 'front'): Promise<{
  readonly ownX: number
  readonly ownY: number
  readonly otherX: number
  readonly otherY: number
}> {
  return pixiProbe.probeLayer(layer)
}

export function cleanupPixi(): void {
  pixiProbe.cleanup()
}
