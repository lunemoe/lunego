import { describe, expect, it } from 'vitest'
import { ContentRegistry } from '@lunego/core'
import {
  AcceptQuest,
  ApplyStatus,
  AttackTarget,
  CombatHealth,
  DialogueChoose,
  DialogueStart,
  DialogueSnapshot,
  EquipItem,
  EquipmentState,
  GroundItem,
  InventoryState,
  ItemPicked,
  PickupItem,
  QuestLogSnapshot,
  StatusState,
  buildRuntimeContent,
  registerRuntimeCatalogs,
  runtimeValueHash,
  type RuntimeCatalogs,
} from '../index.js'
import { catalogs, item, makeFeature, makeWorld } from './fixtures.js'

function registryFor(values: RuntimeCatalogs): ContentRegistry {
  const registry = new ContentRegistry()
  registerRuntimeCatalogs(registry, values)
  return registry
}

describe('runtime content/hash', () => {
  it('validates cross references and accepts empty optional catalogs', () => {
    const feature = makeFeature()
    expect(feature.name).toBe('fixture.runtime')
    const bad = {
      ...catalogs,
      quests: new Map([['fixture.quest', {
        id: 'fixture.quest',
        objectives: [{ id: 'x', type: 'collect' as const, target: 'missing', required: 1 }],
      }]]),
    }
    expect(() => buildRuntimeContent(registryFor(bad), bad)).toThrow(/missing item|missing content|missing/)

    const zone = catalogs.zones.get('fixture.zone')!
    const badZone = {
      ...catalogs,
      zones: new Map([['fixture.zone', { ...zone, encounterId: 'missing' }]]),
    }
    expect(() => buildRuntimeContent(registryFor(badZone), badZone)).toThrow(/missing content/)
  })

  it('makes content fingerprints value-sensitive for every catalog', () => {
    const first = registryFor(catalogs)
    const changedItem = {
      ...catalogs,
      items: new Map([['fixture.sword', { ...item, maxStack: 2 }]]),
    }
    const changedStatus = {
      ...catalogs,
      statuses: new Map([[
        'fixture.dot',
        { ...catalogs.statuses.get('fixture.dot')!, durationTicks: 9 },
      ]]),
    }
    const second = registryFor(changedItem)
    const third = registryFor(changedStatus)
    expect(first.fingerprint()).not.toBe(second.fingerprint())
    expect(first.fingerprint()).not.toBe(third.fingerprint())
    expect(() => buildRuntimeContent(second, catalogs)).toThrow(/hash is stale/)
    expect(() => buildRuntimeContent(third, catalogs)).toThrow(/hash is stale/)
  })

  it('rejects functions/closures in content values instead of hashing them', () => {
    expect(() => runtimeValueHash({ id: 'fixture', hook: () => 1 })).toThrow(/functions/)
    expect(() => runtimeValueHash({ id: 'fixture', when: new Date(0) })).toThrow(/plain JSON/)
  })

  it('runs a deterministic actor/AI/attack/loot/equipment/quest slice', async () => {
    const run = async () => {
      const { world, player, enemy } = makeWorld({
        dropFor: () => ({ id: 'drop-1', contentId: 'fixture.sword', quantity: 1, affixes: [] }),
      })
      void world.send(AcceptQuest, { quest: 'fixture.quest' })
      void world.send(AttackTarget, { target: enemy, ability: 'fixture.attack' })
      world.step()
      world.step()
      const ground = world.world.query(GroundItem)[0]
      expect(ground).toBeDefined()
      void world.send(PickupItem, { ground: ground as number })
      world.step()
      const inventory = JSON.parse(world.world.get(player, InventoryState)?.snapshot ?? '{"slots":[]}')
      expect(inventory.slots[0]?.contentId).toBe('fixture.sword')
      void world.send(EquipItem, { slot: 0 })
      world.step()
      const equipment = JSON.parse(world.world.get(player, EquipmentState)?.snapshot ?? '{"slots":{}}')
      expect(equipment.slots.weapon?.contentId).toBe('fixture.sword')
      const quest = JSON.parse(world.world.get(player, QuestLogSnapshot)?.snapshot ?? '{}')
      expect(quest.quests['fixture.quest']?.status).toBe('completed')
      return { hash: world.world.hash(), player, enemy }
    }
    const first = await run()
    const second = await run()
    expect(first.hash).toBe(second.hash)
    expect(first.player).toBe(second.player)
  })

  it('runs AI pursuit/damage and ticks status snapshots and dialogues once', async () => {
    const { world, player } = makeWorld()
    world.step(40)
    expect(world.world.get(player, CombatHealth)?.current).toBeLessThan(20)

    const apply = world.send(ApplyStatus, {
      target: player, status: 'fixture.dot', source: 'fixture.source', stacks: 1,
    })
    world.step(5)
    expect(await apply).toEqual({ status: 'ok' })
    expect(JSON.parse(world.world.get(player, StatusState)?.snapshot ?? '{}')).toEqual({ version: 1, statuses: [] })

    void world.send(DialogueStart, { dialogue: 'fixture.dialogue' })
    world.step()
    void world.send(DialogueChoose, { choice: 'ok' })
    world.step()
    const dialogue = JSON.parse(world.world.get(player, DialogueSnapshot)?.snapshot ?? '{}') as { runner?: { used?: readonly string[] } }
    expect(dialogue.runner?.used).toContain('start\u0000ok')

    const events = world.events(ItemPicked)
    expect(events).toEqual([])
  })
})
