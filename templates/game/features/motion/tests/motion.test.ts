import { describe, expect, it } from 'vitest'
import { ContentRegistry } from '@lunego/core'
import { createGame } from '@lunego/host'
import {
  AcceptQuest,
  AttackTarget,
  EncounterStart,
  EquipItem,
  MoveIntent,
  PickupItem,
  SpawnActor,
} from '@lunego/kit-runtime'
import { MotionFeature } from '../logic/index.js'
import { HudQuery, Renderable, Start, type HudView } from '../schema.js'
import { createDemoRuntime, registerDemoContent } from '../content/demo.js'

type DemoGame = ReturnType<typeof createGame>

function create(): DemoGame {
  const content = new ContentRegistry()
  const runtime = createDemoRuntime(registerDemoContent(content))
  return createGame({
    features: [runtime, MotionFeature],
    content,
    seed: 7,
    dt: 1 / 60,
    schemaVersion: 6,
  })
}

function hud(game: DemoGame): HudView {
  const value = game.query<unknown, HudView | null>(HudQuery, {})
  if (value === null) throw new Error('player is missing')
  return value
}

async function playSlice(game: DemoGame): Promise<void> {
  void game.send(Start, {})
  void game.send(SpawnActor.type, { prefab: 'demo.player', controllable: true })
  void game.send(SpawnActor.type, { prefab: 'demo.crate', controllable: false })
  game.step()
  expect(game.view.get(1, Renderable)).toBeDefined()
  void game.send(EncounterStart.type, { encounter: 'demo.encounter' })
  void game.send(AcceptQuest.type, { quest: 'demo.quest' })
  game.step()
  void game.send(MoveIntent.type, { x: 90, y: 0 })
  game.step()
  for (let attack = 0; attack < 2; attack += 1) {
    const target = hud(game).enemy
    expect(target).toBeGreaterThan(0)
    void game.send(AttackTarget.type, { target, ability: 'demo.strike' })
    game.step()
  }
  const ground = hud(game).ground
  expect(ground).toBeGreaterThan(0)
  void game.send(PickupItem.type, { ground })
  game.step()
  const item = hud(game).inventory[0]
  expect(item).toBeDefined()
  void game.send(EquipItem.type, { slot: item?.slot ?? -1 })
  game.step()
}

describe('demo template vertical slice', () => {
  it('runs encounter, combat, loot, equipment and quest with a fixed seed', async () => {
    const first = create()
    await playSlice(first)
    const firstHud = hud(first)
    expect(firstHud.quests.find((quest) => quest.id === 'demo.quest')?.status).toBe('completed')
    expect(firstHud.inventory).toHaveLength(0)

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
    expect(profile?.name).toBe('Demo')
  })
})
