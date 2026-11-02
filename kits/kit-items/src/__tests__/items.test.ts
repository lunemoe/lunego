import { describe, expect, it } from 'vitest'
import { rollLoot, type LootTable } from '@lunego/kit-loot'
import {
  Equipment,
  Inventory,
  ItemFactory,
  ItemIdentity,
  Stash,
  itemModifiers,
  type ItemDefCatalog,
  type ItemInstance,
} from '../index.js'

const catalog: ItemDefCatalog = {
  potion: { id: 'potion', maxStack: 10, tags: ['consumable'] },
  sword: { id: 'sword', slot: 'weapon', maxStack: 1 },
  ring: { id: 'ring', slot: 'ring', maxStack: 1, sockets: 1 },
}

function factory(): ItemFactory {
  return new ItemFactory({ catalog })
}

describe('item factory/inventory', () => {
  it('stacks, splits, merges and rejects atomically when full', () => {
    const make = factory()
    const bag = new Inventory({ capacity: 3, catalog, factory: make })
    const potion = make.create('potion', { quantity: 15 })
    expect(bag.add(potion).ok).toBe(true)
    expect(bag.items.map((item) => item?.quantity)).toEqual([10, 5, undefined])
    expect(bag.add(make.create('potion', { quantity: 16 }))).toEqual({ ok: false, reason: 'full' })
    expect(bag.items.map((item) => item?.quantity)).toEqual([10, 5, undefined])

    const split = bag.split(0, 4)
    expect(split.ok).toBe(true)
    expect(bag.items.map((item) => item?.quantity)).toEqual([6, 5, 4])
    expect(bag.merge(2, 1).ok).toBe(true)
    expect(bag.items[1]?.quantity).toBe(9)
    expect(bag.move(0, 1).ok).toBe(true)
    expect(bag.items[1]?.quantity).toBe(10)
  })

  it('removes, transfers and serializes deterministically', () => {
    const make = factory()
    const source = new Inventory({ capacity: 2, catalog, factory: make })
    const target = new Inventory({ capacity: 1, catalog })
    source.add(make.create('potion', { quantity: 7 }))
    expect(source.transfer(0, target, 3).ok).toBe(true)
    expect(source.items[0]?.quantity).toBe(4)
    expect(target.items[0]?.quantity).toBe(3)
    target.add(make.create('potion', { quantity: 7 }))
    expect(target.items[0]?.quantity).toBe(10)
    expect(source.transfer(0, target, 4)).toEqual({ ok: false, reason: 'full' })
    expect(source.items[0]?.quantity).toBe(4)
    const json = JSON.parse(JSON.stringify(source.toJSON()))
    const restored = Inventory.fromJSON({ capacity: 2, catalog, snapshot: json })
    expect(restored.items).toEqual(source.items)
    expect(new Stash({ capacity: 1, catalog }).capacity).toBe(1)
  })

  it('honors caller equipment slots and maps loot affixes to stats', () => {
    const make = factory()
    const equipment = new Equipment({
      slots: ['weapon', 'ring'],
      catalog,
      rules: { canEquip: (def, slot) => def.slot === slot },
      identity: make.identity,
    })
    const sword = make.create('sword')
    expect(equipment.equip('ring', sword)).toEqual({ ok: false, reason: 'cannot_equip' })
    expect(equipment.equip('weapon', sword).ok).toBe(true)
    expect(equipment.equip('weapon', sword)).toEqual({ ok: false, reason: 'slot_mismatch' })
    expect(equipment.get('weapon')?.id).toBe(sword.id)
    expect(equipment.unequip('weapon').ok).toBe(true)
    expect(equipment.get('weapon')).toBeNull()

    const ring = make.create('ring', {
      affixes: [{ affix: 'sharp', modifiers: [{ stat: 'attack', mode: 'add', value: 2 }] }],
    })
    expect(itemModifiers(ring)).toEqual([
      { stat: 'attack', mode: 'add', value: 2, source: `item:${ring.id}:sharp` },
    ])
    equipment.equip('ring', ring)
    expect(Object.keys(equipment.toJSON().items)).toEqual(['ring'])
    const restored = Equipment.fromJSON({
      slots: ['weapon', 'ring'],
      catalog,
      rules: { canEquip: (def, slot) => def.slot === slot },
      snapshot: JSON.parse(JSON.stringify(equipment.toJSON())),
    })
    expect(restored.get('ring')?.id).toBe(ring.id)
  })
})

function allIds(items: readonly (ItemInstance | null)[], extra: readonly ItemInstance[] = []): string[] {
  return [...items.flatMap((item) => item === null ? [] : [item.id]), ...extra.map((item) => item.id)]
}

describe('item identity snapshots', () => {
  it('shares one identity across bags, stash, equipment and ground drops after restore', () => {
    const identity = new ItemIdentity({ sequence: 7, splitSequence: 3 })
    const make = new ItemFactory({ catalog, identity })
    const rules = { canEquip: (def: { slot?: string }, slot: string) => def.slot === slot }
    const bagA = new Inventory({ capacity: 4, catalog, identity })
    const bagB = new Inventory({ capacity: 4, catalog, identity })
    const stash = new Stash({ capacity: 2, catalog, identity })
    const equipment = new Equipment({ slots: ['weapon'], catalog, rules, identity })
    bagA.add(make.create('potion', { quantity: 10 }))
    expect(bagA.split(0, 4).ok).toBe(true)
    equipment.equip('weapon', make.create('sword'))
    const ground = [make.create('potion', { quantity: 2 })]
    const saved = {
      bagA: bagA.toJSON(),
      bagB: bagB.toJSON(),
      stash: stash.toJSON(),
      equipment: equipment.toJSON(),
      ground,
      identity: identity.toJSON(),
    }

    const restoredIdentity = ItemIdentity.fromJSON(JSON.parse(JSON.stringify(saved.identity)))
    const restoredA = Inventory.fromJSON({
      capacity: 4,
      catalog,
      snapshot: saved.bagA,
      identity: restoredIdentity,
    })
    const restoredB = Inventory.fromJSON({
      capacity: 4,
      catalog,
      snapshot: saved.bagB,
      identity: restoredIdentity,
    })
    const restoredStash = Inventory.fromJSON({
      capacity: 2,
      catalog,
      snapshot: saved.stash,
      identity: restoredIdentity,
    })
    const restoredEquipment = Equipment.fromJSON({
      slots: ['weapon'],
      catalog,
      rules,
      snapshot: saved.equipment,
      identity: restoredIdentity,
    })
    const restoredGround = saved.ground.map((item) => ({ ...item }))
    const makeRestored = new ItemFactory({ catalog, identity: restoredIdentity })

    restoredB.add(makeRestored.create('potion', { quantity: 3 }))
    expect(restoredA.split(0, 2).ok).toBe(true)
    restoredGround.push(makeRestored.create('potion', { quantity: 1 }))
    restoredStash.add(makeRestored.create('potion', { quantity: 5 }))

    const ids = [
      ...allIds(restoredA.items),
      ...allIds(restoredB.items),
      ...allIds(restoredStash.items),
      ...allIds([restoredEquipment.get('weapon')]),
      ...restoredGround.map((item) => item.id),
    ]
    expect(new Set(ids).size).toBe(ids.length)
    expect(restoredA.items.flatMap((item) => item === null ? [] : [item.id]).some((id) => id.endsWith('.split.4'))).toBe(true)
    expect(restoredIdentity.sequence).toBeGreaterThan(saved.identity.sequence)
    expect(restoredIdentity.splitSequence).toBeGreaterThan(saved.identity.splitSequence)
  })

  it('restores counters from the snapshot instead of a container max suffix', () => {
    const snapshot = {
      version: 1 as const,
      slots: [{ id: 'potion#1', contentId: 'potion', quantity: 2, affixes: [] }],
      identity: { version: 1 as const, sequence: 100, splitSequence: 40 },
    }
    const restored = Inventory.fromJSON({ capacity: 1, catalog, snapshot })
    expect(restored.identity.sequence).toBe(100)
    expect(restored.factoryForKit.create('potion').id).toBe('potion#100')
    expect(restored.identity.splitSequence).toBe(40)
  })

  it('serializes and restores the factory sequence independently', () => {
    const identity = new ItemIdentity({ sequence: 12, splitSequence: 5 })
    const factory = new ItemFactory({ catalog, identity })
    factory.create('potion')
    const restored = ItemFactory.fromJSON(factory.toJSON(), { catalog })
    expect(restored.sequence).toBe(13)
    expect(restored.create('potion').id).toBe('potion#13')
    expect(restored.identity.splitSequence).toBe(5)
  })

  it('produces the same item state hash for continuous and N/2 save-load runs', () => {
    type World = {
      identity: ItemIdentity
      a: Inventory
      b: Inventory
      stash: Inventory
      equipment: Equipment
      ground: ItemInstance[]
    }
    const rules = { canEquip: (def: { slot?: string }, slot: string) => def.slot === slot }
    const createWorld = (identity: ItemIdentity): World => ({
      identity,
      a: new Inventory({ capacity: 5, catalog, identity }),
      b: new Inventory({ capacity: 5, catalog, identity }),
      stash: new Stash({ capacity: 3, catalog, identity }),
      equipment: new Equipment({ slots: ['weapon'], catalog, rules, identity }),
      ground: [],
    })
    const step = (world: World, index: number): void => {
      const make = new ItemFactory({ catalog, identity: world.identity })
      if (index === 0) {
        world.a.add(make.create('potion', { quantity: 10 }))
      } else if (index === 1) {
        world.a.split(0, 3)
      } else if (index === 2) {
        world.b.add(make.create('potion', { quantity: 5 }))
      } else if (index === 3) {
        world.equipment.equip('weapon', make.create('sword'))
      } else if (index === 4) {
        world.a.transfer(0, world.b, 2)
      } else if (index === 5) {
        world.b.split(0, 1)
      } else if (index === 6) {
        world.ground.push(make.create('ring'))
      } else if (index === 7) {
        world.a.split(0, 2)
      } else if (index === 8) {
        world.stash.add(make.create('potion', { quantity: 4 }))
      } else if (index === 9) {
        world.b.transfer(0, world.a, 1)
      }
    }
    const state = (world: World): string => JSON.stringify([
      world.a.toJSON(),
      world.b.toJSON(),
      world.stash.toJSON(),
      world.equipment.toJSON(),
      world.ground,
    ])

    const continuous = createWorld(new ItemIdentity())
    for (let index = 0; index < 5; index += 1) {
      step(continuous, index)
    }
    const saved = {
      a: continuous.a.toJSON(),
      b: continuous.b.toJSON(),
      stash: continuous.stash.toJSON(),
      equipment: continuous.equipment.toJSON(),
      ground: continuous.ground.map((item) => ({ ...item })),
      identity: continuous.identity.toJSON(),
    }
    for (let index = 5; index < 10; index += 1) {
      step(continuous, index)
    }

    const restoredIdentity = ItemIdentity.fromJSON(saved.identity)
    const restored = createWorld(restoredIdentity)
    restored.a = Inventory.fromJSON({ capacity: 5, catalog, snapshot: saved.a, identity: restoredIdentity })
    restored.b = Inventory.fromJSON({ capacity: 5, catalog, snapshot: saved.b, identity: restoredIdentity })
    restored.stash = Inventory.fromJSON({ capacity: 3, catalog, snapshot: saved.stash, identity: restoredIdentity })
    restored.equipment = Equipment.fromJSON({
      slots: ['weapon'],
      catalog,
      rules,
      snapshot: saved.equipment,
      identity: restoredIdentity,
    })
    restored.ground = saved.ground
    for (let index = 5; index < 10; index += 1) {
      step(restored, index)
    }
    expect(state(restored)).toBe(state(continuous))
  })
})

function seeded(seed: number) {
  let state = seed >>> 0
  const next = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
  return {
    next,
    uint32: () => Math.floor(next() * 4294967296) >>> 0,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max) => min + next() * (max - min),
    chance: (probability) => next() < probability,
    pick: (items) => items[Math.floor(next() * items.length)] as never,
  }
}

describe('kit-loot integration', () => {
  it('turns a fixed-seed loot roll into a stable ItemInstance', () => {
    const table: LootTable = {
      rarities: [
        { id: 'common', weight: 1, minAffixes: 0, maxAffixes: 0 },
        { id: 'rare', weight: 1, minAffixes: 1, maxAffixes: 1 },
      ],
      affixes: [
        { id: 'sharp', weight: 1, rolls: [{ stat: 'attack', mode: 'add', min: 1, max: 3, integer: true }] },
      ],
    }
    const first = rollLoot(seeded(7), table)
    const second = rollLoot(seeded(7), table)
    expect(first).toEqual(second)
    const make = factory()
    const a = make.create('sword', { rarity: first.rarity, affixes: first.affixes })
    const b = factory().create('sword', { rarity: second.rarity, affixes: second.affixes })
    expect(a.id).toBe('sword#1')
    expect(b.id).toBe('sword#1')
    expect(a.affixes).toEqual(b.affixes)
  })
})
