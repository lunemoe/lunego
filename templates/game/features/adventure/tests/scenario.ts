import { ContentRegistry } from '@lunego/core'
import { createGame } from '@lunego/host'
import {
  AcceptQuest, ActorPosition, AttackTarget, EncounterStart, EquipItem, MoveIntent,
  PickupItem, SellItem, SpawnActor, UseItem,
} from '@lunego/kit-runtime'
import { AdventureFeature } from '../logic/index.js'
import { createP9Runtime, registerP9Content } from '../content/catalog.js'
import { HudQuery, Start, type HudView } from '../schema.js'

export function createScenario() {
  const content = new ContentRegistry()
  const runtime = createP9Runtime(registerP9Content(content))
  return createGame({ features: [runtime, AdventureFeature], content, seed: 7, dt: 1 / 60, schemaVersion: 14 })
}
export type ScenarioGame = ReturnType<typeof createScenario>
export function readHud(game: ScenarioGame): HudView {
  const view = game.query(HudQuery, {})
  if (view === null) throw new Error('missing player')
  return view
}
export function beginScenario(game: ScenarioGame): void {
  void game.send(Start, {})
  void game.send(SpawnActor, { prefab: 'p9.player', controllable: true })
  void game.send(SpawnActor, { prefab: 'p9.crate', controllable: false })
  void game.send(EncounterStart.type, { encounter: 'p9.encounter' })
  void game.send(AcceptQuest.type, { quest: 'p9.quest' }, { tick: game.tick + 2 })
  game.step()
}

/** A player using only ordinary movement, abilities, pickup, equipment and supplies. */
export function clearFloor(game: ScenarioGame): void {
  for (let tick = 0; tick < 6000 && readHud(game).outcome === 'playing'; tick += 1) {
    const view = readHud(game)
    const playerPosition = game.view.get(view.player, ActorPosition)!
    const enemyPosition = view.enemy > 0 ? game.view.get(view.enemy, ActorPosition) : undefined
    const groundPosition = view.ground > 0 ? game.view.get(view.ground, ActorPosition) : undefined
    const destination = groundPosition ?? enemyPosition
    if (destination !== undefined) {
      const dx = destination.x - playerPosition.x
      const dy = destination.y - playerPosition.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      const stop = groundPosition === undefined ? 32 : 8
      void game.send(MoveIntent, { x: distance > stop ? dx / distance : 0, y: distance > stop ? dy / distance : 0 })
    }
    if (view.enemy > 0) {
      if (view.cooldowns.strike === 0) void game.send(AttackTarget.type, { target: view.enemy, ability: 'p9.strike' })
      if (view.cooldowns.burst === 0) void game.send(AttackTarget.type, { target: view.enemy, ability: 'p9.burst' })
    }
    if (view.ground > 0) void game.send(PickupItem, { ground: view.ground })
    const best = [...view.inventory].filter((item) => item.contentId !== 'p9.potion').sort((a, b) => b.power - a.power)[0]
    if (best !== undefined) {
      if (best.power > view.weaponPower) void game.send(EquipItem, { slot: best.slot })
      else void game.send(SellItem.type, { vendor: 'p9.vendor', slot: best.slot })
    }
    const potion = view.inventory.find((item) => item.contentId === 'p9.potion')
    if (view.hp < view.maxHp / 2 && potion !== undefined) void game.send(UseItem, { slot: potion.slot })
    game.step()
  }
}
