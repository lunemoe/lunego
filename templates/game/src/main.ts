import { ContentRegistry } from '@lunego/core'
import type { Game } from '@lunego/host'
import {
  bindBrowserKeys,
  createBrowserProfileStorage,
  createBrowserSaveStore,
  createGame,
  createViewLoop,
  exposeBrowserDebug,
  ProfileStore,
} from '@lunego/host'
import { UiMenuStack, createUiBridge } from '@lunego/ui'
import {
  ActionContext,
  GamepadSource,
  attachBrowserGamepad,
  attachBrowserInput,
  createInput,
} from '@lunego/input'
import {
  Effects,
  VfxSystem,
} from '@lunego/vfx'
import type { VfxSystem as VfxSystemType } from '@lunego/vfx'
import {
  AcceptQuest,
  ActorPosition,
  AttackTarget,
  EncounterStart,
  MoveIntent,
  PickupItem,
  SpawnActor,
} from '@lunego/kit-runtime'
import { HudQuery, Start, type HudView } from '../features/motion/schema.js'
import { MotionFeature } from '../features/motion/logic/index.js'
import { DemoTextContent, createDemoRuntime, registerDemoContent } from '../features/motion/content/demo.js'
import { createDemoView } from './view/render.js'
import { mountDemoUi } from './view/ui.js'

const SAVE_KEY = '__GAME_NAME__-save'
const PROFILE_ACCOUNT = 'template'
const PROFILE_SLOT = 'demo'

declare global {
  interface Window {
    __luneGame?: {
      readonly game: Game
      readonly vfx: VfxSystemType
      readonly renderer: Awaited<ReturnType<typeof createDemoView>>['renderer']
      readonly input: ReturnType<typeof createInput>
      readonly gamepad: GamepadSource
      readonly save: () => void
      readonly load: () => void
      readonly hud: () => HudView | null
      readonly position: () => { readonly x: number; readonly y: number } | null
      readonly pendingCommands: () => number
    }
  }
}

async function boot(): Promise<void> {
  const content = new ContentRegistry()
  content.addPack(DemoTextContent)
  const runtimeContent = registerDemoContent(content)
  const runtimeFeature = createDemoRuntime(runtimeContent)
  const vfx = new VfxSystem({ width: 480, height: 270, maxEffects: 64 })
  const game = createGame({
    features: [runtimeFeature, MotionFeature],
    content,
    seed: 7,
    dt: 1 / 60,
    schemaVersion: 8,
    timeMode: 'realtime',
    onFrame: (frame) => {
      if (!frame.render) return
      for (const event of frame.events) {
        const payload = event.payload as { readonly target?: number; readonly entity?: number }
        const entity = payload.target ?? payload.entity
        const position = entity === undefined ? undefined : game.view.get(entity, ActorPosition)
        if (position === undefined) continue
        if (event.type === 'runtime.combat.damaged') {
          vfx.play({
            effect: Effects.impactSpark,
            x: position.x,
            y: position.y,
            layer: 'front',
            scale: 0.7,
            seed: frame.tick * 31 + 1,
          })
        } else if (event.type === 'runtime.combat.died') {
          vfx.play({
            effect: Effects.explosionSmall,
            x: position.x,
            y: position.y,
            layer: 'ground',
            scale: 0.8,
            seed: frame.tick * 31 + 2,
          })
        } else if (event.type === 'runtime.items.dropped') {
          vfx.play({
            effect: Effects.coinSpin,
            x: position.x,
            y: position.y,
            layer: 'ground',
            scale: 0.6,
            seed: frame.tick * 31 + 3,
          })
        }
      }
    },
  })

  const bridge = createUiBridge(game)
  const inputContext = new ActionContext()
  const menuStack = new UiMenuStack()
  let menuActive = false
  menuStack.subscribe(() => {
    if (menuStack.depth > 0 && !menuActive) {
      menuActive = true
      inputContext.push('menu')
    } else if (menuStack.depth === 0 && menuActive) {
      menuActive = false
      inputContext.pop('menu')
    }
  })

  const saves = createBrowserSaveStore(SAVE_KEY)
  const profiles = new ProfileStore({ storage: createBrowserProfileStorage() })
  const save = (): void => {
    try {
      const pair = game.saveGame()
      saves.save(pair.world)
      if (profiles.has(PROFILE_ACCOUNT, PROFILE_SLOT)) {
        profiles.save(PROFILE_ACCOUNT, PROFILE_SLOT, pair.profile)
      } else {
        profiles.create(PROFILE_ACCOUNT, PROFILE_SLOT, pair.profile)
      }
    } catch (error) {
      console.error('save failed', error)
    }
  }
  const load = (): void => {
    try {
      const world = saves.load()
      if (world === null) return
      const profile = profiles.load(PROFILE_ACCOUNT, PROFILE_SLOT, {
        tick: world.tick,
        schemaVersion: world.schemaVersion,
      })
      game.loadGame({ world, profile })
    } catch (error) {
      console.error('load failed', error)
    }
  }
  const hud = (): HudView | null => game.query<unknown, HudView | null>(HudQuery, {})

  const uiHandle = mountDemoUi({ bridge, menuStack, hud, save, load })
  const { renderer, surface, renderSystem, camera } = await createDemoView(vfx)

  const gamepad = new GamepadSource()
  attachBrowserGamepad(gamepad)
  const gamepadBindings = {
    buttons: [
      { action: 'attack', button: 0 },
      { action: 'interact', button: 1 },
      { action: 'inventory', button: 2 },
      { action: 'quests', button: 3 },
    ],
    axes: [
      { action: 'left', axis: 0, direction: -1 as const },
      { action: 'right', axis: 0, direction: 1 as const },
      { action: 'up', axis: 1, direction: -1 as const },
      { action: 'down', axis: 1, direction: 1 as const },
    ],
  }
  let lastX = 0
  let lastY = 0
  const input = createInput({
    context: inputContext,
    map: {
      left: ['ArrowLeft', 'KeyA'],
      right: ['ArrowRight', 'KeyD'],
      up: ['ArrowUp', 'KeyW'],
      down: ['ArrowDown', 'KeyS'],
      attack: ['KeyF'],
      interact: ['KeyE'],
      inventory: ['KeyI'],
      quests: ['KeyQ'],
      save: ['KeyK'],
      load: ['KeyJ'],
    },
    gamepad,
    gamepadBindings,
    onDeviceChange: () => uiHandle.setGamepadConnected(gamepad.connected),
    toCommands: (actions) => {
      const commands: { type: string; payload: unknown }[] = []
      const x = actions.axis('left', 'right')
      const y = actions.axis('up', 'down')
      if (x !== lastX || y !== lastY) {
        lastX = x
        lastY = y
        commands.push({ type: MoveIntent.type, payload: { x: x * 90, y: y * 90 } })
      }
      const view = hud()
      if (actions.wasPressed('attack') && view !== null && view.enemy > 0) {
        commands.push({ type: AttackTarget.type, payload: { target: view.enemy, ability: 'demo.strike' } })
      }
      if (actions.wasPressed('interact') && view !== null && view.ground > 0) {
        commands.push({ type: PickupItem.type, payload: { ground: view.ground } })
      }
      if (actions.wasPressed('save')) save()
      if (actions.wasPressed('load')) load()
      return commands
    },
  })
  attachBrowserInput(input)
  bindBrowserKeys({ KeyK: save, KeyJ: load })

  void game.send(Start, {})
  void game.send(SpawnActor.type, { prefab: 'demo.player', controllable: true })
  void game.send(SpawnActor.type, { prefab: 'demo.crate', controllable: false })
  void game.send(EncounterStart.type, { encounter: 'demo.encounter' })
  void game.send(AcceptQuest.type, { quest: 'demo.quest' })

  createViewLoop({
    game,
    update: (view) => {
      for (const command of input.poll()) {
        void game.send(command.type, command.payload)
      }
      const player = hud()?.player ?? 0
      if (player > 0) {
        const position = game.view.get(player, ActorPosition)
        if (position !== undefined) {
          camera.setZoom(renderer.zoom)
          const point = camera.follow({ x: position.x, y: position.y })
          renderSystem.setCamera(point.x, point.y)
        }
      }
      const viewport = renderer.viewport
      input.pointer.setViewport(viewport)
      if (view.frame.render) {
        vfx.update(view.dt)
        renderSystem.sync(game.view, view.frame.elapsed)
        surface.render(viewport.cameraX, viewport.cameraY, viewport.zoom)
      }
    },
  })
  const position = (): { readonly x: number; readonly y: number } | null => {
    const player = hud()?.player ?? 0
    if (player <= 0) return null
    const value = game.view.get(player, ActorPosition)
    return value === undefined ? null : { x: value.x, y: value.y }
  }
  exposeBrowserDebug('__luneGame', {
    game, vfx, renderer, input, gamepad, save, load, hud, position,
    pendingCommands: () => game.pendingCommandCount,
  })
}

await boot()
export default {
  schemaVersion: 8,
}
