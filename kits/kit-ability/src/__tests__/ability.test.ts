import { describe, expect, it } from 'vitest'
import {
  checkCast,
  defineAbility,
  isReady,
  nearestTargets,
  readyAt,
  remainingCooldown,
  resolveTargeting,
  targetsInCone,
  type TargetCandidate,
} from '../index.js'

const candidates: TargetCandidate[] = [
  { id: 3, x: 10, y: 0 },
  { id: 1, x: 5, y: 0 },
  { id: 2, x: 0, y: 20 },
  { id: 4, x: 5, y: 0 },
]

const query = { origin: { x: 0, y: 0 }, facing: { x: 1, y: 0 }, candidates }

describe('ability gates', () => {
  it('checks cooldown ticks and resource costs', () => {
    const ability = defineAbility({
      id: 'burst',
      cooldownTicks: 10,
      costs: [{ resource: 'energy', amount: 5 }],
    })
    const state = readyAt(ability, 3)
    expect(isReady(state, 2)).toBe(false)
    expect(remainingCooldown(state, 2)).toBe(11)
    expect(isReady(state, 13)).toBe(true)
    expect(checkCast(ability, state, 13, { energy: 5 })).toEqual({ ok: true })
    expect(checkCast(ability, state, 13, { energy: 4 })).toEqual({
      ok: false,
      reason: 'resource',
    })
    expect(checkCast(ability, state, 2, { energy: 99 })).toEqual({
      ok: false,
      reason: 'cooldown',
    })
  })

  it('validates ability definitions', () => {
    expect(() => defineAbility({ id: '', cooldownTicks: 0 })).toThrow(/id/)
    expect(() => defineAbility({ id: 'x', cooldownTicks: -1 })).toThrow(/cooldownTicks/)
    expect(() =>
      defineAbility({ id: 'x', cooldownTicks: 1, costs: [{ resource: '', amount: 1 }] }),
    ).toThrow(/cost/)
  })
})

describe('targeting', () => {
  it('selects direction cones deterministically', () => {
    expect(targetsInCone(query, 12, 0.5).map((target) => target.id)).toEqual([1, 4, 3])
    expect(targetsInCone(query, 12, 0.95).map((target) => target.id)).toEqual([1, 4, 3])
    expect(targetsInCone({ ...query, facing: { x: 0, y: 1 } }, 30, 0.5).map((t) => t.id)).toEqual([2])
  })

  it('selects nearest targets with stable distance/id ties', () => {
    expect(nearestTargets(query, 30).map((target) => target.id)).toEqual([1])
    expect(nearestTargets(query, 30, 3).map((target) => target.id)).toEqual([1, 4, 3])
  })

  it('resolves none, point, direction and nearest descriptions', () => {
    expect(resolveTargeting(undefined, query)).toEqual({ kind: 'none' })
    expect(resolveTargeting({ kind: 'point' }, { ...query, aim: { x: 4, y: 7 } })).toEqual({
      kind: 'point',
      x: 4,
      y: 7,
    })
    expect(resolveTargeting({ kind: 'direction', range: 12 }, query)).toMatchObject({
      kind: 'direction',
      x: 1,
      y: 0,
    })
    expect(
      resolveTargeting({ kind: 'nearest', range: 30 }, query).targets?.map((target) => target.id),
    ).toEqual([1])
  })
})
