import { describe, expect, it } from 'vitest'
import { ContentRegistry } from '@lunego/core'
import { TestWorld, testWorld } from '@lunego/testkit'
import {
  ActorControllable, ActorPosition, ActorVelocity, AttackTarget, CombatDead,
  CombatDefenses, CombatHealth, DamageRequested, Died, EncounterCompleted,
  EncounterMember, EncounterStart, EncounterStateModel, EquipItem, EquipmentState,
  GroundItem, InventoryState, MoveIntent, PickupItem, SellItem, UseItem, WalletState,
  buildRuntimeContent, createRuntimeFeature, registerRuntimeCatalogs,
  type RuntimeCatalogs, type RuntimeHooks,
} from '../index.js'
import { catalogs } from './fixtures.js'

function setup(overrides: Partial<RuntimeCatalogs> = {}, hooks: RuntimeHooks = {}) {
  const values = { ...catalogs, ...overrides }
  const registry = new ContentRegistry()
  registerRuntimeCatalogs(registry, values)
  const content = buildRuntimeContent(registry, values)
  const feature = createRuntimeFeature({ name: 'play', content, hooks, pickupRange: 4, waveDelayTicks: 2 })
  const world = testWorld({ features: [feature], seed: 7 })
  const player = world.spawn(values.prefabs.get('fixture.player')!)
  world.add(player, ActorControllable)
  const enemy = world.spawn(values.prefabs.get('fixture.enemy')!)
  return { world, player, enemy, feature }
}

describe('runtime playability', () => {
  it('resolves area attacks against hostiles and charges one cooldown', async () => {
    const abilities = new Map([['fixture.attack', {
      id: 'fixture.attack', ability: { id: 'fixture.attack', cooldownTicks: 5 },
      damage: { amount: 1, type: 'physical' }, areaRadius: 3,
    }]])
    const { world, enemy, player } = setup({ abilities })
    const near = world.spawn(catalogs.prefabs.get('fixture.enemy')!)
    const attack = world.send(AttackTarget, { target: enemy, ability: 'fixture.attack' })
    world.step()
    expect(await attack).toEqual({ status: 'ok' })
    expect(world.get(enemy, CombatHealth)?.current).toBe(4)
    expect(world.get(near, CombatHealth)?.current).toBe(4)
    expect(world.get(player, CombatHealth)?.current).toBe(20)
    const repeated = world.send(AttackTarget, { target: enemy, ability: 'fixture.attack' })
    world.step()
    expect(await repeated).toEqual({ status: 'rejected', reason: 'cooldown' })
  })

  it('sells inventory items atomically and rejects a second sale of the same slot', async () => {
    const { world, player } = setup()
    const ground = world.spawn({
      'runtime.actor.position': { x: 1, y: 0 },
      'runtime.items.ground': { item: JSON.stringify({ id: 'sale', contentId: 'fixture.sword', quantity: 1, affixes: [] }) },
    })
    void world.send(PickupItem, { ground })
    world.step()
    const sale = world.send(SellItem, { vendor: 'fixture.vendor', slot: 0 })
    const duplicate = world.send(SellItem, { vendor: 'fixture.vendor', slot: 0 })
    world.step()
    expect(await sale).toEqual({ status: 'ok' })
    expect(await duplicate).toEqual({ status: 'rejected', reason: 'missing_item' })
    expect(world.get(player, WalletState)?.gold).toBe(52)
  })
  it('uses speed and normalizes diagonal input; stopping preserves facing', async () => {
    const { world, player } = setup()
    void world.send(MoveIntent, { x: 1, y: 1 })
    world.step()
    const velocity = world.get(player, ActorVelocity)!
    expect(velocity.x * velocity.x + velocity.y * velocity.y).toBeCloseTo(1)
    void world.send(MoveIntent, { x: 0, y: 0 })
    world.step()
    expect(world.get(player, ActorVelocity)).toEqual({ x: 0, y: 0 })
  })

  it('enforces range and persisted per-actor cooldowns, including same-tick commands', async () => {
    const abilities = new Map([['fixture.attack', {
      id: 'fixture.attack', ability: { id: 'fixture.attack', cooldownTicks: 5, target: { kind: 'nearest' as const, range: 3 } },
      damage: { amount: 1, type: 'physical' },
    }]])
    const { world, enemy, feature } = setup({ abilities })
    const first = world.send(AttackTarget, { target: enemy, ability: 'fixture.attack' })
    const duplicate = world.send(AttackTarget, { target: enemy, ability: 'fixture.attack' })
    world.step()
    expect(await first).toEqual({ status: 'ok' })
    expect(await duplicate).toEqual({ status: 'rejected', reason: 'cooldown' })
    const restored = TestWorld.fromSnapshot(world.snapshot(), { features: [feature] })
    const cooldown = restored.send(AttackTarget, { target: enemy, ability: 'fixture.attack', source: 1 })
    restored.step()
    expect(await cooldown).toEqual({ status: 'rejected', reason: 'cooldown' })
    const far = world.spawn({
      'runtime.actor.position': { x: 100, y: 0 },
      'runtime.combat.team': { side: 'enemy' },
      'runtime.combat.health': { current: 5, max: 5 },
    })
    world.step(5)
    const range = world.send(AttackTarget, { target: far, ability: 'fixture.attack' })
    world.step()
    expect(await range).toEqual({ status: 'rejected', reason: 'out_of_range' })
  })

  it('ignores dead actors and emits death and loot only once for simultaneous lethal hits', async () => {
    const { world, enemy } = setup({}, {
      dropFor: (_ctx, entity) => ({ id: `drop-${entity}`, contentId: 'fixture.sword', quantity: 1, affixes: [] }),
    })
    world.emit(DamageRequested, { source: 1, target: enemy, amount: 9, damageType: 'physical' })
    world.emit(DamageRequested, { source: 1, target: enemy, amount: 9, damageType: 'physical' })
    world.step()
    expect(world.events(Died)).toHaveLength(1)
    expect(world.query(GroundItem)).toHaveLength(1)
    const position = world.get(enemy, ActorPosition)
    world.step(5)
    expect(world.get(enemy, ActorPosition)).toEqual(position)
    world.add(1, CombatDead)
    const move = world.send(MoveIntent, { x: 1, y: 0 })
    world.step()
    expect(await move).toEqual({ status: 'ok' })
    expect(world.get(1, ActorVelocity)).toEqual({ x: 0, y: 0 })
  })

  it('consumes shields and applies resistance without requiring defenses on every target', () => {
    const { world, player, enemy } = setup()
    world.remove(player, CombatDefenses)
    world.add(player, CombatDefenses, { armor: 0, dodge: 0, block: 0, shield: 3, resistances: [{ type: 'fire', value: 0.5 }] })
    world.emit(DamageRequested, { source: enemy, target: player, amount: 8, damageType: 'fire' })
    world.step()
    expect(world.get(player, CombatHealth)?.current).toBe(19)
    expect(world.get(player, CombatDefenses)?.shield).toBe(0)
    world.emit(DamageRequested, { source: enemy, target: player, amount: 8, damageType: 'fire' })
    world.step()
    expect(world.get(player, CombatHealth)?.current).toBe(15)
  })

  it('places loot at the death position and prevents remote or duplicate pickups', async () => {
    const { world, enemy } = setup({}, {
      dropFor: () => ({ id: 'drop', contentId: 'fixture.sword', quantity: 1, affixes: [] }),
    })
    void world.send(AttackTarget, { target: enemy, ability: 'fixture.attack' })
    world.step()
    const ground = world.query(GroundItem)[0]!
    expect(world.get(ground, ActorPosition)).toEqual(world.get(enemy, ActorPosition))
    const pickup = world.send(PickupItem, { ground })
    const duplicate = world.send(PickupItem, { ground })
    world.step()
    expect(await pickup).toEqual({ status: 'ok' })
    expect(await duplicate).toEqual({ status: 'rejected', reason: 'missing_ground' })
    const far = world.spawn({
      'runtime.actor.position': { x: 100, y: 0 },
      'runtime.items.ground': { item: JSON.stringify({ id: 'far', contentId: 'fixture.sword', quantity: 1, affixes: [] }) },
    })
    const remote = world.send(PickupItem, { ground: far })
    world.step()
    expect(await remote).toEqual({ status: 'rejected', reason: 'out_of_range' })
  })

  it('advances waves after a delay, restores the transition, and completes exactly once', async () => {
    const def = catalogs.encounters.get('fixture.encounter')!
    const encounters = new Map([[def.id, { ...def, waves: [def.waves[0]!, { ...def.waves[0]!, id: 'two' }] }]])
    const { world, player, feature } = setup({ encounters })
    void world.send(EncounterStart, { encounter: def.id })
    world.step()
    expect(world.model(EncounterStateModel).nextWaveTick).toBe(0)
    const first = world.query(EncounterMember)[0]!
    world.emit(DamageRequested, { source: player, target: first, amount: 100, damageType: 'physical' })
    world.step()
    const restored = TestWorld.fromSnapshot(world.snapshot(), { features: [feature] })
    restored.step(2)
    const next = restored.query(EncounterMember).find((entity) => !restored.has(entity, CombatDead))!
    expect(next).toBeDefined()
    expect(restored.get(next, EncounterMember)?.wave).toBe('two')
    restored.emit(DamageRequested, { source: player, target: next, amount: 100, damageType: 'physical' })
    restored.step()
    expect(restored.model(EncounterStateModel).completed).toBe(true)
    expect(restored.events(EncounterCompleted)).toHaveLength(1)
    restored.step(10)
    expect(restored.events(EncounterCompleted)).toHaveLength(0)
  })

  it('swaps equipped items and consumes healing items only when useful', async () => {
    const potion = { id: 'fixture.potion', maxStack: 5, heal: 8 }
    const { world, player } = setup({ items: new Map([...catalogs.items, [potion.id, potion]]) })
    world.remove(player, InventoryState)
    world.add(player, InventoryState, { snapshot: JSON.stringify({ slots: [
      { id: 'sword2', contentId: 'fixture.sword', quantity: 1, affixes: [] },
      { id: 'potion', contentId: potion.id, quantity: 2, affixes: [] },
    ] }) })
    world.remove(player, EquipmentState)
    world.add(player, EquipmentState, { snapshot: JSON.stringify({ slots: { weapon: { id: 'sword1', contentId: 'fixture.sword', quantity: 1, affixes: [] } } }) })
    void world.send(EquipItem, { slot: 0 })
    const full = world.send(UseItem, { slot: 1 })
    world.step()
    expect(await full).toEqual({ status: 'rejected', reason: 'full_health' })
    expect(JSON.parse(world.get(player, EquipmentState)!.snapshot).slots.weapon.id).toBe('sword2')
    expect(JSON.parse(world.get(player, InventoryState)!.snapshot).slots[0].id).toBe('sword1')
    world.emit(DamageRequested, { source: 2, target: player, amount: 12, damageType: 'physical' })
    world.step()
    void world.send(UseItem, { slot: 1 })
    world.step()
    expect(world.get(player, CombatHealth)?.current).toBe(16)
    expect(JSON.parse(world.get(player, InventoryState)!.snapshot).slots[1].quantity).toBe(1)
  })
})
