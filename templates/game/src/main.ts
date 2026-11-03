import { ContentRegistry } from '@lunego/core'
import type { Game } from '@lunego/host'
import {
  bindBrowserKeys, createBrowserGameSaveStore, createGame,
  createViewLoop, exposeBrowserDebug,
} from '@lunego/host'
import { EffectOverlay, UiMenuStack, createUiBridge } from '@lunego/ui'
import {
  ActionContext, GamepadSource, attachBrowserGamepad, attachBrowserInput, createInput,
} from '@lunego/input'
import { Effects, VfxSystem } from '@lunego/vfx'
import type { VfxSystem as VfxSystemType } from '@lunego/vfx'
import {
  AcceptQuest, ActorPosition, AttackTarget, EncounterStart, MoveIntent,
  PickupItem, SpawnActor, UseItem,
} from '@lunego/kit-runtime'
import { AdvanceRun, Revive, HudQuery, Start, type HudView } from '../features/adventure/schema.js'
import { AdventureFeature } from '../features/adventure/logic/index.js'
import { createP9Runtime, registerP9Content } from '../features/adventure/content/catalog.js'
import { createP9Audio } from './view/audio.js'
import { createP9View } from './view/render.js'
import { mountP9Ui } from './view/ui.js'
import { itemName, t } from './i18n.js'

const SAVE_KEY = 'p9-save-v14'

declare global {
  interface Window {
    __luneGame?: {
      readonly audio: Awaited<ReturnType<typeof createP9Audio>>['info']
      readonly game: Game
      readonly vfx: VfxSystemType
      readonly renderer: Awaited<ReturnType<typeof createP9View>>['renderer']
      readonly input: ReturnType<typeof createInput>
      readonly gamepad: GamepadSource
      readonly save: () => void
      readonly load: () => void
      readonly restart: () => void
      readonly hud: () => HudView | null
      readonly position: () => { readonly x: number; readonly y: number } | null
      readonly pendingCommands: () => number
    }
  }
}

async function boot(): Promise<void> {
  const content = new ContentRegistry()
  const runtime = createP9Runtime(registerP9Content(content))
  const vfx = new VfxSystem({ width: 480, height: 270, maxEffects: 64 })
  const presentation = await createP9View(vfx)
  const { renderer, surface, renderSystem, camera } = presentation
  const sound = await createP9Audio()
  const effects = new EffectOverlay('#effects')
  let reducedMotion = false
  const game = createGame({
    features: [runtime, AdventureFeature], content, seed: 7, dt: 1 / 60, schemaVersion: 14,
    timeMode: 'realtime',
    onFrame: (frame) => {
      presentation.present(frame)
      const currentHud = hud()
      sound.present(frame, currentHud?.player ?? 0, currentHud?.level ?? 1)
      for (const event of frame.events) {
        const payload = event.payload as { readonly source?: number; readonly target?: number; readonly entity?: number; readonly amount?: number; readonly ability?: string; readonly item?: string }
        const entity = payload.target ?? payload.entity
        const position = entity === undefined ? undefined : game.view.get(entity, ActorPosition)
        if (position === undefined) continue
        if (event.type === 'runtime.combat.damaged') {
          effects.floatingText({ x: position.x, y: position.y, text: `${Math.ceil(payload.amount ?? 0)}`, color: entity === hud()?.player ? '#ff8f8b' : '#fff0cd' }, renderer.viewport)
          if (!reducedMotion) vfx.play({ effect: Effects.impactSpark, x: position.x, y: position.y, layer: 'front', scale: 0.7, seed: frame.tick * 31 + 1 })
        } else if (event.type === 'runtime.ability.used' && !reducedMotion) {
          vfx.play({ effect: payload.ability === 'p9.burst' ? Effects.explosionSmall : Effects.impactSpark,
            x: position.x, y: position.y, layer: 'front', scale: payload.ability === 'p9.burst' ? 1.2 : 0.5, seed: frame.tick * 31 + 2 })
        } else if (event.type === 'runtime.items.picked' && payload.item !== undefined) {
          uiHandle.notify(t('p9.itemPicked', { item: itemName(payload.item) }))
        }
      }
    },
  })
  const hud = (): HudView | null => game.query(HudQuery, {})
  const bridge = createUiBridge(game)
  const inputContext = new ActionContext()
  const menuStack = new UiMenuStack()
  const send = (type: string, payload: unknown, quiet = false, tick = game.tick + 1): void => {
    void game.send(type, payload, { tick }).then((result) => {
      if (result.status !== 'rejected' || quiet) return
      const keys: Readonly<Record<string, string>> = {
        out_of_range: 'p9.outOfRange', cooldown: 'p9.cooldown', full_health: 'p9.fullHealth',
        inventory_full: 'p9.inventoryFull', insufficient_gold: 'p9.noGold',
      }
      uiHandle.notify(t(keys[result.reason] ?? 'p9.error'))
    }).catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'game_loaded') return
      uiHandle.notify(t('p9.error'))
    })
  }
  const saves = createBrowserGameSaveStore(SAVE_KEY)
  const save = (): void => {
    try {
      saves.save(game.saveGame())
      uiHandle.notify(t('p9.saved'))
    } catch {
      uiHandle.notify(t('p9.saveFailed'))
    }
  }
  function resetMovement(): void {
    input.releaseAll()
    lastX = Number.NaN; lastY = Number.NaN; lastAttackTick = -1
  }
  const load = (): void => {
    try {
      const pair = saves.load()
      if (pair === null) { uiHandle.notify(t('p9.noSave')); return }
      game.loadGame(pair)
      resetMovement()
      effects.clear()
      vfx.clear()
      presentation.clear()
      sound.clear()
      uiHandle.notify(t('p9.loaded'))
    } catch {
      uiHandle.notify(t('p9.loadFailed'))
    }
  }
  const attack = (ability: string, quiet = false): void => {
    const view = hud()
    if (view === null || view.outcome !== 'playing') return
    if (view.enemy === 0) { if (!quiet) uiHandle.notify(t('p9.noTarget')); return }
    send(AttackTarget.type, { target: view.enemy, ability }, quiet)
  }
  const pickup = (): void => {
    const ground = hud()?.ground ?? 0
    if (ground > 0) send(PickupItem.type, { ground })
    else uiHandle.notify(t('p9.noLoot'))
  }
  const heal = (): void => {
    const potion = hud()?.inventory.find((item) => item.contentId === 'p9.potion')
    if (potion !== undefined) send(UseItem.type, { slot: potion.slot })
    else uiHandle.notify(t('p9.noPotion'))
  }
  // Queue the fresh-run commands before the first simulation tick, so replay and
  // restart use the same canonical state and RNG sequence.
  const initialRun = game.saveGame()
  const begin = (): void => {
    send(Start.type, {})
    send(SpawnActor.type, { prefab: 'p9.player', controllable: true })
    send(SpawnActor.type, { prefab: 'p9.crate', controllable: false })
    send(EncounterStart.type, { encounter: 'p9.encounter' })
    send(AcceptQuest.type, { quest: 'p9.quest' }, false, game.tick + 2)
  }
  const restart = (): void => {
    game.loadGame(initialRun)
    resetMovement()
    effects.clear()
    vfx.clear()
    presentation.clear()
    sound.clear()
    begin()
  }
  const continueRun = (mode: 'advance' | 'revive'): void => {
    const outcome = hud()?.outcome
    if ((mode === 'advance' && outcome !== 'victory') || (mode === 'revive' && outcome !== 'defeat')) return
    resetMovement()
    effects.clear()
    vfx.clear()
    presentation.clear()
    sound.clear()
    send(mode === 'advance' ? AdvanceRun.type : Revive.type, {})
    send(EncounterStart.type, { encounter: 'p9.encounter' }, false, game.tick + 2)
  }
  const uiHandle = mountP9Ui({ bridge, menuStack, hud, save, load, restart, attack, pickup, heal, send,
    advance: () => continueRun('advance'), revive: () => continueRun('revive'),
    mute: sound.setMuted,
    reducedMotion: (value) => { reducedMotion = value; effects.setReducedMotion(value); if (value) vfx.clear() },
  })
  const gamepad = new GamepadSource()
  attachBrowserGamepad(gamepad)
  let lastX = 0
  let lastY = 0
  let lastAttackTick = -1
  const input = createInput({
    context: inputContext,
    map: {
      left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
      up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
      attack: ['KeyF', 'Space'], burst: ['KeyR'], interact: ['KeyE'], heal: ['KeyH'],
    },
    gamepad,
    gamepadBindings: {
      buttons: [{ action: 'attack', button: 0 }, { action: 'interact', button: 1 }, { action: 'burst', button: 2 }, { action: 'heal', button: 3 }],
      axes: [{ action: 'left', axis: 0, direction: -1 }, { action: 'right', axis: 0, direction: 1 }, { action: 'up', axis: 1, direction: -1 }, { action: 'down', axis: 1, direction: 1 }],
    },
    onDeviceChange: () => uiHandle.setGamepadConnected(gamepad.connected),
    toCommands: (actions, pointer) => {
      const commands: { type: string; payload: unknown }[] = []
      const x = actions.axis('left', 'right')
      const y = actions.axis('up', 'down')
      if (x !== lastX || y !== lastY) {
        lastX = x; lastY = y
        commands.push({ type: MoveIntent.type, payload: { x, y } })
      }
      const view = hud()
      if (view !== null && view.outcome === 'playing' && view.enemy > 0 && lastAttackTick !== game.tick) {
        if ((actions.isDown('attack') || pointer.isDown(0)) && view.cooldowns.strike === 0) {
          attack('p9.strike', true); lastAttackTick = game.tick
        }
        if ((actions.isDown('burst') || pointer.isDown(2)) && view.cooldowns.burst === 0) {
          attack('p9.burst', true); lastAttackTick = game.tick
        }
      }
      if (actions.wasPressed('interact')) pickup()
      if (actions.wasPressed('heal')) heal()
      return commands
    },
  })
  attachBrowserInput(input, undefined, renderer.element)
  let menuActive = false
  let resumeAfterMenu = false
  menuStack.subscribe(() => {
    if (menuStack.depth > 0 && !menuActive) {
      menuActive = true
      resumeAfterMenu = !game.paused
      inputContext.push('menu')
      resetMovement()
      send(MoveIntent.type, { x: 0, y: 0 }, true)
      game.pause()
    } else if (menuStack.depth === 0 && menuActive) {
      menuActive = false
      inputContext.pop('menu')
      resetMovement()
      if (resumeAfterMenu) game.resume()
    }
  })
  bindBrowserKeys({
    KeyK: () => { if (!menuActive) save() }, KeyJ: () => { if (!menuActive) load() },
    KeyI: () => { if (!menuActive) uiHandle.openInventory() },
    KeyQ: () => { if (!menuActive) uiHandle.openQuests() },
    KeyN: () => { if (!menuActive) continueRun('advance') },
    KeyV: () => { if (!menuActive) continueRun('revive') },
    Escape: () => { if (!menuActive) uiHandle.openSettings() },
  })
  begin()
  createViewLoop({ game, update: (view) => {
    for (const command of input.poll()) send(command.type, command.payload, true)
    const player = hud()?.player ?? 0
    const point = player > 0 ? game.view.get(player, ActorPosition) : undefined
    if (point !== undefined) {
      camera.setZoom(renderer.zoom)
      const followed = camera.follow(point)
      renderSystem.setCamera(followed.x, followed.y)
    }
    const viewport = renderer.viewport
    input.pointer.setViewport(viewport)
    effects.update(view.elapsed)
    vfx.update(view.dt)
    presentation.sync(game.view, view.frame.elapsed, hud()?.stage ?? 1)
    surface.render(viewport.cameraX, viewport.cameraY, viewport.zoom)
  } })
  const position = (): { readonly x: number; readonly y: number } | null => {
    const player = hud()?.player ?? 0
    const value = player > 0 ? game.view.get(player, ActorPosition) : undefined
    return value === undefined ? null : { x: value.x, y: value.y }
  }
  exposeBrowserDebug('__luneGame', { game, audio: sound.info, vfx, renderer, input, gamepad, save, load, restart, hud, position,
    pendingCommands: () => game.pendingCommandCount,
  })
}
await boot()
