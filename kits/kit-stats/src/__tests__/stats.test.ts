import { describe, expect, it } from 'vitest'
import { StatBlock, aggregateAffixes, aggregateStats } from '../index.js'

const definitions = [
  { id: 'power', base: 10 },
  { id: 'speed', base: 1, min: 0.2, max: 3 },
  { id: 'health', base: 100 },
]

describe('stat aggregation', () => {
  it('adds, multiplies and clamps in a deterministic order', () => {
    const values = aggregateStats(definitions, [
      { stat: 'power', mode: 'add', value: 5 },
      { stat: 'power', mode: 'mul', value: 0.5 },
      { stat: 'speed', mode: 'mul', value: 5 },
      { stat: 'health', mode: 'add', value: -30 },
    ])
    expect(values).toEqual({ power: 22.5, speed: 3, health: 70 })
  })

  it('aggregates affix instances and ignores unknown stats only by throwing', () => {
    const values = aggregateAffixes(definitions, [
      {
        affix: 'sharp',
        modifiers: [{ stat: 'power', mode: 'add', value: 4 }],
      },
      {
        affix: 'quick',
        modifiers: [{ stat: 'speed', mode: 'mul', value: 0.25 }],
      },
    ])
    expect(values.power).toBe(14)
    expect(values.speed).toBe(1.25)
    expect(() =>
      aggregateStats(definitions, [{ stat: 'unknown', mode: 'add', value: 1 }]),
    ).toThrow(/unknown stat/)
  })
})

describe('stat block', () => {
  it('tracks sources, rebases and recomputes snapshots', () => {
    const block = new StatBlock(definitions, { power: 20 })
    block.add({ stat: 'power', mode: 'add', value: 5 }, 'gear')
    block.add({ stat: 'speed', mode: 'mul', value: 0.5 }, 'buff')
    expect(block.value('power')).toBe(25)
    expect(block.snapshot()).toEqual({ power: 25, speed: 1.5, health: 100 })
    block.removeSource('gear')
    expect(block.value('power')).toBe(20)
    block.setBase('power', 8)
    expect(block.value('power')).toBe(8)
    block.clearModifiers()
    expect(block.value('speed')).toBe(1)
    expect(() => block.add({ stat: 'nope', mode: 'add', value: 1 })).toThrow(/unknown stat/)
  })
})
