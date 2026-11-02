import { describe, expect, it } from 'vitest'
import { rollLoot, type LootTable } from '@lunego/kit-loot'
import {
  Equipment,
  Inventory,
  ItemFactory,
  Stash,
  itemModifiers,
  type ItemDefCatalog,
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
    const restored = Inventory.fromJSON({ capacity: 2, catalog, slots: json })
    expect(restored.items).toEqual(source.items)
    expect(new Stash({ capacity: 1, catalog }).capacity).toBe(1)
  })

  it('honors caller equipment slots and maps loot affixes to stats', () => {
    const make = factory()
    const equipment = new Equipment({
      slots: ['weapon', 'ring'],
      catalog,
      rules: { canEquip: (def, slot) => def.slot === slot },
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
    expect(Object.keys(equipment.toJSON())).toEqual(['ring'])
    const restored = Equipment.fromJSON({
      slots: ['weapon', 'ring'],
      catalog,
      rules: { canEquip: (def, slot) => def.slot === slot },
      items: JSON.parse(JSON.stringify(equipment.toJSON())),
    })
    expect(restored.get('ring')?.id).toBe(ring.id)
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
