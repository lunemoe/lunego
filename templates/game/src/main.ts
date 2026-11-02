import type { Game } from '@lunego/host'
import {
  bindBrowserKeys,
  createBrowserSaveStore,
  createGame,
  createViewLoop,
  exposeBrowserDebug,
} from '@lunego/host'
import {
  Bar,
  Button,
  KeyHint,
  Modal,
  Panel,
  UiRoot,
  createUiBridge,
  createUiSignal,
  mountUi,
} from '@lunego/ui'
import { attachBrowserInput, createInput } from '@lunego/input'
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
import {
  Effects,
  VfxSystem,
  defineCueMap,
  mountCanvasEffectSurface,
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
    schemaVersion: 4,
    timeMode: 'realtime',
    onFrame: (frame) => vfx.consume(frame, cueMap),
  })

  const bridge = createUiBridge(game)
  const [helpOpen, setHelpOpen] = createUiSignal(false)
  {
    mountUi('#ui', bridge, (ui) => {
      const vitals = () => ui.models()['Vitals'] as { hp: number; maxHp: number } | undefined
      return UiRoot({
        theme: { accent: '#58c8ff', accentText: '#08121c' },
        children: [
          Panel({
            title: 'Status',
            children: [
              Bar({
                kind: 'hp',
                value: () => vitals()?.hp ?? 0,
                max: () => vitals()?.maxHp ?? 100,
              }),
              Button({
                children: 'Move right',
                onClick: () => void ui.send(MoveIntent.type, { x: 1, y: 0 }),
              }),
              Button({
                children: 'Help',
                onClick: () => setHelpOpen(true),
              }),
            ],
          }),
          Modal({
            open: helpOpen,
            title: 'Controls',
            onClose: () => setHelpOpen(false),
            children: [
              KeyHint({ keys: ['W', 'A', 'S', 'D'] }),
              Button({ children: 'Close', onClick: () => setHelpOpen(false) }),
            ],
          }),
        ],
      })
    })
  }

  const renderer = await createPixiRenderer({
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
          if (renderable?.width !== undefined) {
            object.width = renderable.width
          }
          if (renderable?.height !== undefined) {
            object.height = renderable.height
          }
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
  attachBrowserInput(input)

  const saves = createBrowserSaveStore(SAVE_KEY)
  const save = (): void => {
    saves.save(game.save())
  }
  const load = (): void => {
    try {
      const snapshot = saves.load()
      if (snapshot !== null) {
        game.load(snapshot)
      }
    } catch (error) {
      console.error('load failed', error)
    }
  }
  bindBrowserKeys({ KeyK: save, KeyJ: load })

  void game.send(Start, {})

  createViewLoop({
    game,
    update: (view) => {
      for (const command of input.poll()) {
        void game.send(command.type, command.payload)
      }
      const player = game.view.entities(Player)[0]
      if (player !== undefined) {
        const position = game.view.get(player, Position)
        if (position !== undefined) {
          camera.setZoom(renderer.zoom)
          const point = camera.follow(position)
          renderSystem.setCamera(point.x, point.y)
        }
      }
      const viewport = renderer.viewport
      vfx.update(view.dt)
      renderSystem.sync(game.view, view.frame.elapsed)
      input.pointer.setViewport(viewport)
      surface.render(viewport.cameraX, viewport.cameraY, viewport.zoom)
    },
  })
  exposeBrowserDebug('__luneGame', { game, vfx, renderer, input, save, load })
}

await boot()
