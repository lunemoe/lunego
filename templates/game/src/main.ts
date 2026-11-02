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
      readonly save: () => void
      readonly load: () => void
    }
  }
}

async function boot(): Promise<void> {
  const game = createGame({
    features: [MotionFeature],
    dt: 1 / 60,
    timeMode: 'realtime',
  })

  const renderer = await createPixiRenderer({
    width: 480,
    height: 270,
    background: 0x0b1018,
    container: document.querySelector<HTMLElement>('#game') ?? document.body,
  })

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
        renderSystem.setCamera(position.x - 240, position.y - 135)
      }
    }
    renderSystem.sync(game.view)
    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
  window.__luneGame = { game, save, load }
}

await boot()
