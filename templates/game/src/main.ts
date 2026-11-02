import type { Game } from '@lunego/host'
import type { WorldSnapshot } from '@lunego/core'
import { createGame } from '@lunego/host'
import { attachKeyboard, attachPointer, createInput } from '@lunego/input'
import {
  RenderSystem,
  backgroundSpec,
  createPixiRenderer,
  defineRenderBinding,
  rectSpec,
  spriteSpec,
} from '@lunego/render-pixi'
import {
  CanvasEffectSurface,
  Effects,
  VfxSystem,
  defineCueMap,
} from '@lunego/vfx'
import type { VfxSystem as VfxSystemType } from '@lunego/vfx'
import {
  MoveDust,
  MoveIntent,
  Player,
  Position,
  Renderable,
  Start,
} from '../features/motion/schema.js'
import { MotionFeature } from '../features/motion/logic/index.js'

const SAVE_KEY = '__GAME_NAME__-save'

declare global {
  interface Window {
    __luneGame?: {
      readonly game: Game
      readonly vfx: VfxSystemType
      readonly renderer: Awaited<ReturnType<typeof createPixiRenderer>>
      readonly input: ReturnType<typeof createInput>
      readonly save: () => void
      readonly load: () => void
    }
  }
}

async function boot(): Promise<void> {
  const vfx = new VfxSystem({ width: 480, height: 270, maxEffects: 64 })
  const cueMap = defineCueMap({
    [MoveDust.name]: (cue) => {
      const { at } = cue.payload as { at: { x: number; y: number } }
      return [
        {
          effect: Effects.poof,
          x: at.x,
          y: at.y,
          layer: 'ground',
          scale: 0.55,
        },
      ]
    },
  })
  const game = createGame({
    features: [MotionFeature],
    dt: 1 / 60,
    schemaVersion: 3,
    timeMode: 'realtime',
    onFrame: (frame) => vfx.consume(frame, cueMap),
  })

  const renderer = await createPixiRenderer({
    width: 480,
    height: 270,
    background: 0x0b1018,
    container: document.querySelector<HTMLElement>('#game') ?? document.body,
  })

  const overlay = document.createElement('canvas')
  overlay.className = 'vfx-layer'
  const container = document.querySelector<HTMLElement>('#game') ?? document.body
  container.appendChild(overlay)
  const surface = new CanvasEffectSurface(vfx, overlay)

  const crate = document.createElement('canvas')
  crate.width = 16
  crate.height = 16
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

  const backdrop = document.createElement('canvas')
  backdrop.width = 480
  backdrop.height = 270
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

  const tileset = document.createElement('canvas')
  tileset.width = 32
  tileset.height = 16
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
  renderSystem.add(
    defineRenderBinding({
      query: [Position, Renderable],
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
        const position = view.lerp(Position)
        const renderable = view.get(Renderable)
        object.x = position.x
        object.y = position.y
        if (object.kind !== 'rect') {
          object.width = renderable?.width ?? object.width
          object.height = renderable?.height ?? object.height
          return
        }
        object.width = renderable?.width ?? object.width
        object.height = renderable?.height ?? object.height
        object.color = renderable?.color ?? object.color
      },
    }),
  )

  let lastX = 0
  let lastY = 0
  const input = createInput({
    map: {
      left: ['ArrowLeft', 'KeyA'],
      right: ['ArrowRight', 'KeyD'],
      up: ['ArrowUp', 'KeyW'],
      down: ['ArrowDown', 'KeyS'],
    },
    toCommands: (actions) => {
      const x = actions.axis('left', 'right')
      const y = actions.axis('up', 'down')
      if (x === lastX && y === lastY) {
        return []
      }
      lastX = x
      lastY = y
      return [{ type: MoveIntent.type, payload: { x, y } }]
    },
  })
  attachKeyboard(input, window)
  attachPointer(input, window)

  function save(): void {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game.save()))
  }

  function load(): void {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw !== null) {
      game.load(JSON.parse(raw) as WorldSnapshot)
    }
  }

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyK') {
      save()
    }
    if (event.code === 'KeyJ') {
      load()
    }
  })

  void game.send(Start, {})

  let previous = performance.now()
  let cameraX = 0
  let cameraY = 0
  function frame(now: number): void {
    const delta = Math.max(0, Math.min(0.1, (now - previous) / 1000))
    previous = now
    game.update(delta)
    for (const command of input.poll()) {
      void game.send(command.type, command.payload)
    }
    const player = game.view.entities(Player)[0]
    if (player !== undefined) {
      const position = game.view.get(player, Position)
      if (position !== undefined) {
        cameraX = Math.round(position.x - 240)
        cameraY = Math.round(position.y - 135)
        renderSystem.setCamera(cameraX, cameraY)
      }
    }
    vfx.update(delta)
    renderSystem.sync(game.view, game.frame.elapsed)
    const canvas = renderer.element
    overlay.style.width = canvas.style.width
    overlay.style.height = canvas.style.height
    const bounds = canvas.getBoundingClientRect()
    const cssScale = bounds.width / 480
    overlay.style.left = `${canvas.offsetLeft}px`
    overlay.style.top = `${canvas.offsetTop}px`
    input.pointer.setViewport({
      scale: cssScale > 0 ? cssScale : 1,
      offsetX: bounds.left,
      offsetY: bounds.top,
      cameraX,
      cameraY,
    })
    surface.render(cameraX, cameraY)
    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
  window.__luneGame = { game, vfx, renderer, input, save, load }
}

await boot()
