import { describe, expect, it } from 'vitest'
import type { RngStream } from '@lunego/core'
import { eligibleAffixes, rollLoot, rollRarity, weightedPick } from '../index.js'

function stream(seed = 1): RngStream {
  let state = seed >>> 0 || 1
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
  const uint32 = (): number => Math.floor(next() * 4294967296) >>> 0
  return {
    next,
    uint32,
    int: (min, max) => min + (uint32() % (max - min + 1)),
    float: (min, max) => min + next() * (max - min),
    chance: (probability) => next() < probability,
    pick: (items) => items[uint32() % items.length],
    state: () => [state, state, state, state],
  }
}

const table = {
  rarities: [
    { id: 'common', weight: 70, minAffixes: 0, maxAffixes: 0 },
    { id: 'magic', weight: 25, minAffixes: 1, maxAffixes: 2 },
    { id: 'rare', weight: 5, minAffixes: 2, maxAffixes: 3 },
  ],
  affixes: [
    {
      id: 'power',
      weight: 3,
      rolls: [{ stat: 'power', mode: 'add' as const, min: 1, max: 4, integer: true }],
    },
    {
      id: 'speed',
      weight: 2,
      rarities: { rare: 5 },
      rolls: [{ stat: 'speed', mode: 'mul' as const, min: 0.02, max: 0.05 }],
    },
    {
      id: 'health',
      weight: 1,
      rarities: { common: 0 },
      rolls: [{ stat: 'health', mode: 'add' as const, min: 4, max: 8, integer: true }],
    },
  ],
}

describe('deterministic loot rolls', () => {
  it('picks weighted values deterministically and rejects empty pools', () => {
    const first = stream(9)
    const second = stream(9)
    const entries = [
      { value: 'a', weight: 1 },
      { value: 'b', weight: 3 },
      { value: 'c', weight: 0 },
    ]
    expect(weightedPick(first, entries)).toBe(weightedPick(second, entries))
    expect(() => weightedPick(first, [{ value: 'x', weight: 0 }])).toThrow(/positive/)
    expect(() => weightedPick(first, [{ value: 'x', weight: -1 }])).toThrow(/weight/)
  })

  it('rolls rarity and filters affixes by rarity weight', () => {
    const rng = stream(3)
    const rarity = rollRarity(rng, table)
    expect(['common', 'magic', 'rare']).toContain(rarity.id)
    expect(eligibleAffixes(table, 'common').map((affix) => affix.id)).toEqual(['power', 'speed'])
    expect(eligibleAffixes(table, 'rare').map((affix) => affix.id)).toEqual([
      'power',
      'speed',
      'health',
    ])
  })

  it('rolls the same loot for the same stream and respects count/roll bounds', () => {
    const left = rollLoot(stream(17), table)
    const right = rollLoot(stream(17), table)
    expect(left).toEqual(right)
    const rarity = table.rarities.find((entry) => entry.id === left.rarity)
    expect(left.affixes.length).toBeGreaterThanOrEqual(rarity?.minAffixes ?? 0)
    expect(left.affixes.length).toBeLessThanOrEqual(rarity?.maxAffixes ?? 0)
    for (const affix of left.affixes) {
      for (const modifier of affix.modifiers) {
        const definition = table.affixes.find((entry) => entry.id === affix.affix)
        const roll = definition?.rolls.find((entry) => entry.stat === modifier.stat)
        expect(modifier.value).toBeGreaterThanOrEqual(roll?.min ?? 0)
        expect(modifier.value).toBeLessThanOrEqual(roll?.max ?? 0)
      }
    }
  })
})
