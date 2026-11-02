import { describe, expect, it } from 'vitest'
import { ContentRegistry, type ContentId, type WorldSnapshot } from '@lunego/core'
import { TestWorld, testWorld } from '@lunego/testkit'
import {
  ActorVelocity,
  AiState,
  AcceptQuest,
  ApplyStatus,
  AttackTarget,
  CombatDead,
  CombatHealth,
  DamageRequested,
  EncounterMember,
  EncounterStart,
  GroundItem,
  ItemDefContent,
  ItemDropped,
  ItemPicked,
  MoveIntent,
  PickupItem,
  QuestLogSnapshot,
  StatusState,
  UsePortal,
  ZoneStateModel,
  buildRuntimeContent,
  registerRuntimeCatalogs,
  runtimeValueHash,
} from '../index.js'
import {
  catalogs,
  item,
  makeWorld,
  snapshotWithModel,
} from './fixtures.js'
import {
  parseDialogueSave,
  parseEncounterSave,
  parseInventory,
  parseItemSnapshot,
  parseZoneSnapshot,
} from '../state-bridge.js'

function registered(): ContentRegistry {
  const registry = new ContentRegistry()
  registerRuntimeCatalogs(registry, catalogs)
  return registry
}

describe('runtime correctness regressions', () => {
  it('moves only ActorControllable entities', async () => {
    const { world, player } = makeWorld()
    const staticEntity = world.spawn(catalogs.prefabs.get('fixture.static')!)
    const pending = world.send(MoveIntent, { x: 3, y: -1 })
    world.step()
    expect(await pending).toEqual({ status: 'ok' })
    expect(world.get(player, ActorVelocity)).toEqual({ x: 3, y: -1 })
    expect(world.get(staticEntity, ActorVelocity)).toEqual({ x: 9, y: 9 })
  })

  it('emits ItemDropped before ItemPicked and does not count collect on drop', async () => {
    const { world, player, enemy } = makeWorld({
      dropFor: () => ({ id: 'drop-1', contentId: 'fixture.sword', quantity: 1, affixes: [] }),
    })
    const accept = world.send(AcceptQuest, { quest: 'fixture.quest' })
    const attack = world.send(AttackTarget, { target: enemy, ability: 'fixture.attack' })
    world.step()
    expect(await accept).toEqual({ status: 'ok' })
    expect(await attack).toEqual({ status: 'ok' })
    expect(world.events(ItemDropped)).toHaveLength(1)
    expect(world.events(ItemPicked)).toHaveLength(0)
    const afterDrop = JSON.parse(world.world.get(player, QuestLogSnapshot)?.snapshot ?? '{}')
    expect(afterDrop.quests['fixture.quest']?.status).toBe('active')
    expect(afterDrop.quests['fixture.quest']?.progress?.collect?.count ?? 0).toBe(0)

    const ground = world.query(GroundItem)[0]
    if (ground === undefined) throw new Error('expected a ground item')
    const pickup = world.send(PickupItem, { ground })
    world.step()
    expect(await pickup).toEqual({ status: 'ok' })
    expect(world.events(ItemPicked)).toHaveLength(1)
    const afterPickup = JSON.parse(world.world.get(player, QuestLogSnapshot)?.snapshot ?? '{}')
    expect(afterPickup.quests['fixture.quest']?.status).toBe('completed')
    expect(afterPickup.quests['fixture.quest']?.progress?.collect?.count).toBe(1)
  })

  it('uses the player or explicit source for attack and rejects invalid teams/source 0', async () => {
    const { world, player, enemy } = makeWorld()
    const attack = world.send(AttackTarget, { target: enemy, ability: 'fixture.attack' })
    world.step()
    expect(await attack).toEqual({ status: 'ok' })
    const requested = world.events(DamageRequested)
    expect(requested[0]?.source).toBe(player)
    expect(requested[0]?.target).toBe(enemy)

    const fresh = makeWorld()
    const zero = fresh.world.send(AttackTarget, { target: fresh.enemy, ability: 'fixture.attack', source: 0 })
    fresh.world.step()
    expect(await zero).toEqual({ status: 'rejected', reason: 'invalid_source' })
    const ally = world.spawn({
      'runtime.actor.position': { x: 0, y: 1 },
      'runtime.combat.team': { side: 'player' },
      'runtime.combat.health': { current: 5, max: 5 },
      'runtime.combat.defenses': { armor: 0, dodge: 0, block: 0, shield: 0, resistances: [] },
    })
    const sameTeam = world.send(AttackTarget, { target: ally, ability: 'fixture.attack' })
    world.step()
    expect(await sameTeam).toEqual({ status: 'rejected', reason: 'invalid_target' })
  })

  it('makes EncounterStart idempotent and restores from EncounterStateModel', async () => {
    const { world, feature } = makeWorld()
    const first = world.send(EncounterStart, { encounter: 'fixture.encounter' })
    world.step()
    expect(await first).toEqual({ status: 'ok' })
    expect(world.query(EncounterMember)).toHaveLength(1)
    const second = world.send(EncounterStart, { encounter: 'fixture.encounter' })
    world.step()
    expect(await second).toEqual({ status: 'ok' })
    expect(world.query(EncounterMember)).toHaveLength(1)
    const other = world.send(EncounterStart, { encounter: 'fixture.encounter2' })
    world.step()
    expect(await other).toEqual({ status: 'rejected', reason: 'already_active' })

    const snapshot = JSON.parse(JSON.stringify(world.snapshot())) as WorldSnapshot
    const loaded = TestWorld.fromSnapshot(snapshot, { features: [feature] })
    expect(loaded.query(EncounterMember)).toHaveLength(1)
    const again = loaded.send(EncounterStart, { encounter: 'fixture.encounter' })
    loaded.step()
    expect(await again).toEqual({ status: 'ok' })
    expect(loaded.query(EncounterMember)).toHaveLength(1)
  })

  it('uses zone/portal data for UsePortal and rejects portal ids as zones', async () => {
    const { world, feature } = makeWorld()
    const zoned = testWorld({ features: [feature], seed: 7 })
    const start = TestWorld.fromSnapshot(
      snapshotWithModel(world, 'runtime.zone.state', JSON.stringify({ zone: 'fixture.zone' })),
      { features: [feature] },
    )
    const enter = start.send(UsePortal, { portal: 'fixture.portal' })
    start.step()
    expect(await enter).toEqual({ status: 'ok' })
    expect(JSON.parse(start.model(ZoneStateModel).snapshot)).toEqual({ zone: 'fixture.zone2' })

    const portalAsZone = TestWorld.fromSnapshot(
      snapshotWithModel(world, 'runtime.zone.state', JSON.stringify({ zone: 'fixture.portal' })),
      { features: [feature] },
    )
    const badZone = portalAsZone.send(UsePortal, { portal: 'fixture.portal' })
    portalAsZone.step()
    expect(await badZone).toEqual({ status: 'rejected', reason: 'unknown_zone' })
    const missing = zoned.send(UsePortal, { portal: 'missing' })
    zoned.step()
    expect(await missing).toEqual({ status: 'rejected', reason: 'unknown_portal' })
  })

  it('acquires nearest visible hostiles, clears lost targets and respects line of sight', async () => {
    const open = makeWorld()
    const near = open.world.spawn({
      'runtime.actor.position': { x: 1, y: 0 },
      'runtime.combat.team': { side: 'player' },
      'runtime.combat.health': { current: 5, max: 5 },
      'runtime.combat.defenses': { armor: 0, dodge: 0, block: 0, shield: 0, resistances: [] },
    })
    open.world.step()
    expect(open.world.get(open.enemy, AiState)?.target).toBe(near)
    expect(open.world.get(open.enemy, AiState)?.memory.length).toBeGreaterThan(0)

    const blocked = makeWorld({ hasLineOfSight: () => false })
    blocked.world.step(3)
    expect(blocked.world.get(blocked.enemy, AiState)?.target).toBe(0)
    expect(blocked.world.get(blocked.player, CombatHealth)?.current).toBe(20)

    const blind = makeWorld()
    blind.world.remove(blind.enemy, AiState)
    blind.world.add(blind.enemy, AiState, {
      profile: 'fixture.blind', phase: 'chase', target: blind.player, lastSeenTick: 0,
      blacklist: [], threats: [], memory: [],
    })
    blind.world.step()
    expect(blind.world.get(blind.enemy, AiState)?.target).toBe(0)

    const deadTarget = makeWorld()
    const dummy = deadTarget.world.spawn(catalogs.prefabs.get('fixture.enemy')!)
    deadTarget.world.add(dummy, CombatDead)
    deadTarget.world.remove(deadTarget.enemy, AiState)
    deadTarget.world.add(deadTarget.enemy, AiState, {
      profile: 'fixture.melee', phase: 'chase', target: dummy, lastSeenTick: 0,
      blacklist: [], threats: [], memory: [],
    })
    deadTarget.world.step()
    expect(deadTarget.world.get(deadTarget.enemy, AiState)?.target).toBe(deadTarget.player)
  })

  it('applies statuses through the ApplyStatus command path', async () => {
    const { world, player } = makeWorld()
    const apply = world.send(ApplyStatus, {
      target: player, status: 'fixture.dot', source: 'fixture.source', stacks: 2,
    })
    world.step()
    expect(await apply).toEqual({ status: 'ok' })
    const status = JSON.parse(world.world.get(player, StatusState)?.snapshot ?? '{}')
    expect(status.statuses[0]).toMatchObject({ status: 'fixture.dot', stacks: 2 })
    const unknown = world.send(ApplyStatus, {
      target: player, status: 'missing', source: 'fixture.source', stacks: 1,
    })
    world.step()
    expect(await unknown).toEqual({ status: 'rejected', reason: 'unknown_status' })
  })

  it('rejects malformed snapshots with explicit errors', () => {
    expect(() => parseInventory('{bad')).toThrow(/valid JSON/)
    expect(() => parseInventory('{"slots":[{"id":"x"}]}')).toThrow(/invalid/)
    expect(() => parseItemSnapshot('')).toThrow(/empty/)
    expect(() => parseDialogueSave('{"graph":1}')).toThrow(/graph/)
    expect(() => parseEncounterSave('{}')).toThrow(/encounter/)
    expect(() => parseZoneSnapshot('{"zone":1}')).toThrow(/zone/)
  })

  it('registers per-value hashes and fixed-seed runs include encounter spawns deterministically', async () => {
    const registry = registered()
    const stored = registry.get(
      ItemDefContent,
      'fixture.sword' as ContentId<'runtime.ItemDef'>,
    )
    expect(stored).toEqual({ id: 'fixture.sword', hash: runtimeValueHash(item) })

    const run = async () => {
      const { world } = makeWorld({
        dropFor: () => ({ id: 'drop-1', contentId: 'fixture.sword', quantity: 1, affixes: [] }),
      })
      const start = world.send(EncounterStart, { encounter: 'fixture.encounter' })
      world.step(4)
      expect(await start).toEqual({ status: 'ok' })
      return world.hash()
    }
    expect(await run()).toBe(await run())
    expect(buildRuntimeContent(registry, catalogs).items.size).toBe(1)
  })
})
