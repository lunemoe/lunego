import { describe, expect, it } from 'vitest'
import type { RngStream } from '@lunego/core'
import { defineAbility, resolveTargeting } from '@lunego/kit-ability'
import { addDamageThreat, resolveDamage, ThreatTable, type DamageTarget } from '../index.js'

function rng(chances: readonly boolean[]): RngStream {
  let index = 0
  return {
    next: () => 0,
    uint32: () => 0,
    int: (min) => min,
    float: (min) => min,
    chance: () => chances[index++] ?? false,
    pick: (items) => items[0] as never,
  }
}

const base: DamageTarget = {
  health: 100,
  armor: 5,
  resistances: { fire: 0.5 },
  shield: 10,
  resistanceCap: 0.5,
}

describe('damage pipeline', () => {
  it('applies fixed stage order and shield absorption', () => {
    const result = resolveDamage({ amount: 20, type: 'fire' }, base)
    expect(result.afterBlock).toBe(20)
    expect(result.afterArmor).toBe(15)
    expect(result.afterResistance).toBe(7.5)
    expect(result.absorbed).toBe(7.5)
    expect(result.applied).toBe(0)
    expect(result.health).toBe(100)
    expect(result.shield).toBe(2.5)
  })

  it('dodges before block/armor and blocks before armor', () => {
    const dodged = resolveDamage({ amount: 20, type: 'fire' }, {
      ...base,
      dodgeChance: 1,
      blockChance: 1,
    }, { rng: rng([true]) })
    expect(dodged.dodged).toBe(true)
    expect(dodged.applied).toBe(0)

    const blocked = resolveDamage({ amount: 20, type: 'fire' }, {
      ...base,
      blockChance: 1,
      blockReduction: 0.5,
    }, { rng: rng([true]) })
    expect(blocked.blocked).toBe(true)
    expect(blocked.afterBlock).toBe(10)
    expect(blocked.afterArmor).toBe(5)
    expect(blocked.afterResistance).toBe(2.5)
  })

  it('caps resistance and absorbs into death', () => {
    const capped = resolveDamage({ amount: 20, type: 'fire' }, {
      ...base,
      shield: 0,
      resistances: { fire: 2 },
      resistanceCap: 0.75,
    })
    expect(capped.afterResistance).toBe(3.75)
    const death = resolveDamage({ amount: 30, type: 'fire' }, {
      health: 10,
      shield: 0,
    })
    expect(death.dead).toBe(true)
    expect(death.health).toBe(0)
  })

  it('requires injected RNG for probabilities and is repeatable', () => {
    expect(() => resolveDamage({ amount: 1, type: 'fire' }, {
      health: 10,
      dodgeChance: 0.5,
    })).toThrow(/RngStream/)
    const target = { ...base, dodgeChance: 0.5, blockChance: 0.5, blockReduction: 0.25 }
    const a = resolveDamage({ amount: 20, type: 'fire' }, target, { rng: rng([false, true]) })
    const b = resolveDamage({ amount: 20, type: 'fire' }, target, { rng: rng([false, true]) })
    expect(a).toEqual(b)
  })

  it('connects ability targeting and threat without concrete game content', () => {
    const ability = defineAbility({ id: 'zap', cooldownTicks: 1, target: { kind: 'nearest', range: 5 } })
    const targeting = resolveTargeting(ability.target, {
      origin: { x: 0, y: 0 },
      facing: { x: 1, y: 0 },
      candidates: [{ id: 2, x: 3, y: 0 }],
    })
    expect(targeting.kind).toBe('nearest')
    const packet = { amount: 4, type: 'fire' as const, source: 1 }
    const table = new ThreatTable()
    addDamageThreat(table, 1, packet.amount)
    expect(table.ranked()).toEqual([{ entity: 1, threat: 4 }])
  })
})
