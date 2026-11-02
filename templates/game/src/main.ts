import type { Game } from '@lunego/host'
import type { WorldSnapshot } from '@lunego/core'
import { createGame } from '@lunego/host'
import { attachKeyboard, createInput } from '@lunego/input'
import {
  RenderSystem,
  createPixiRenderer,
  defineRenderBinding,
  rectSpec,
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
    schemaVersion: 2,
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

  const renderSystem = new RenderSystem(renderer)
  renderSystem.add(
    defineRenderBinding({
      query: [Position, Renderable],
      create: (view) => {
        const renderable = view.get(Renderable)
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
    renderSystem.sync(game.view)
    const canvas = renderer.element
    overlay.style.width = canvas.style.width
    overlay.style.height = canvas.style.height
    overlay.style.left = `${canvas.offsetLeft}px`
    overlay.style.top = `${canvas.offsetTop}px`
    surface.render(cameraX, cameraY)
    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
  window.__luneGame = { game, vfx, save, load }
}

await boot()
