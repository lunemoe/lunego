import { describe, expect, it } from 'vitest'
import { ContentRegistry } from '@lunego/core'
import { createGame } from '@lunego/host'
import {
  AcceptQuest,
  ActorPosition,
  AttackTarget,
  EncounterStart,
  EquipItem,
  MoveIntent,
  PickupItem,
  SpawnActor,
} from '@lunego/kit-runtime'
import { AdventureFeature } from '../logic/index.js'
import { HudQuery, Start, type HudView } from '../schema.js'
import { createP9Runtime, registerP9Content } from '../content/catalog.js'

type P9Game = ReturnType<typeof createGame>

function create(): P9Game {
  const content = new ContentRegistry()
  const runtime = createP9Runtime(registerP9Content(content))
  return createGame({
    features: [runtime, AdventureFeature],
    content,
    seed: 7,
    dt: 1 / 60,
    schemaVersion: 14,
  })
}

function hud(game: P9Game): HudView {
  const value = game.query<unknown, HudView | null>(HudQuery, {})
  if (value === null) throw new Error('player is missing')
  return value
}

async function playSlice(game: P9Game): Promise<void> {
  void game.send(Start, {})
  void game.send(SpawnActor.type, { prefab: 'p9.player', controllable: true })
  void game.send(SpawnActor.type, { prefab: 'p9.crate', controllable: false })
  game.step()
  expect(game.view.get(1, ActorPosition)).toBeDefined()
  void game.send(EncounterStart.type, { encounter: 'p9.encounter' })
  void game.send(AcceptQuest.type, { quest: 'p9.quest' })
  game.step()
  void game.send(MoveIntent.type, { x: 1, y: 0 })
  game.step()
  void game.send(MoveIntent.type, { x: 0, y: 0 })
  for (let attack = 0; attack < 2; attack += 1) {
    const target = hud(game).enemy
    expect(target).toBeGreaterThan(0)
    void game.send(AttackTarget.type, { target, ability: 'p9.strike' })
    game.step(18)
  }
  const ground = hud(game).ground
  expect(ground).toBeGreaterThan(0)
  void game.send(PickupItem.type, { ground })
  game.step()
  const item = hud(game).inventory.find((entry) => entry.contentId === 'p9.blade')
  expect(item).toBeDefined()
  void game.send(EquipItem.type, { slot: item?.slot ?? -1 })
  game.step()
}

describe('p9 adventure', () => {
  it('runs encounter, combat, loot, equipment and quest with a fixed seed', async () => {
    const first = create()
    await playSlice(first)
    const firstHud = hud(first)
    expect(firstHud.quests.find((quest) => quest.id === 'p9.quest')?.status).toBe('completed')
    expect(firstHud.weapon).toBe('p9.blade')
    expect(firstHud.inventory.every((item) => item.contentId === 'p9.potion')).toBe(true)

    const second = create()
    await playSlice(second)
    expect(second.frame.hash).toBe(first.frame.hash)
    expect(hud(second)).toEqual(firstHud)
  })

  it('saves and loads world + profile at the same tick', async () => {
    const game = create()
    await playSlice(game)
    const pair = game.saveGame()
    const savedHash = game.frame.hash
    const restored = create()
    restored.loadGame(pair)
    expect(restored.frame.hash).toBe(savedHash)
    const profile = restored.frame.models['CharacterProfile'] as { name?: string; level?: number } | undefined
    expect(profile?.name).toBe('Knight')
  })
})
