import { describe, expect, it } from 'vitest'
import {
  Progression,
  ProgressionGraph,
  tableXpCurve,
  type ProgressionNode,
} from '../index.js'

const nodes: readonly ProgressionNode[] = [
  { id: 'core', maxLevel: 2, flags: ['core'], modifiers: [{ stat: 'power', mode: 'add', value: 1 }] },
  { id: 'strike', requires: [{ id: 'core' }], abilities: ['strike'] },
  { id: 'mastery', requires: [{ id: 'strike' }], flags: ['mastery'] },
]

describe('progression curve/graph', () => {
  it('levels by cumulative thresholds and grants deterministic points', () => {
    const curve = tableXpCurve([100, 150])
    expect(curve.levelForXp(99)).toBe(1)
    expect(curve.levelForXp(100)).toBe(2)
    expect(curve.levelForXp(250)).toBe(3)
    expect(curve.xpForLevel(3)).toBe(250)
    const progression = new Progression({ graph: new ProgressionGraph(nodes), curve })
    expect(progression.addXp(100)).toBe(1)
    expect(progression.points).toBe(1)
    expect(progression.addXp(150)).toBe(1)
    expect(progression.points).toBe(2)
    expect(progression.level).toBe(3)
  })

  it('enforces prerequisites/max ranks and respec refunds all points', () => {
    const graph = new ProgressionGraph(nodes)
    const progression = new Progression({ graph, curve: tableXpCurve([100, 150]), pointsPerLevel: 2 })
    progression.addXp(250)
    expect(progression.allocate('strike')).toBe(false)
    expect(progression.allocate('core')).toBe(true)
    expect(progression.allocate('strike')).toBe(true)
    expect(progression.allocate('core')).toBe(true)
    expect(progression.allocate('core')).toBe(false)
    expect(progression.flags()).toEqual(['core'])
    expect(progression.modifiers()).toEqual([
      { stat: 'power', mode: 'add', value: 1, source: 'progression:core' },
    ])
    expect(progression.abilities()).toEqual(['strike'])
    const state = progression.state()
    expect(progression.respec()).toBe(3)
    expect(progression.points).toBe(4)
    expect(progression.rank('core')).toBe(0)
    progression.restore(state)
    expect(progression.rank('core')).toBe(2)
    expect(progression.rank('strike')).toBe(1)
  })

  it('rejects cycles and unknown prerequisites', () => {
    expect(() => new ProgressionGraph([
      { id: 'a', requires: [{ id: 'b' }] },
      { id: 'b', requires: [{ id: 'a' }] },
    ])).toThrow(/cycle/)
    expect(() => new ProgressionGraph([
      { id: 'a', requires: [{ id: 'missing' }] },
    ])).toThrow(/unknown/)
  })
})
