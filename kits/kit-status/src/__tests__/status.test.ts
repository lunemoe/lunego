import { describe, expect, it } from 'vitest'
import { StatBlock } from '@lunego/kit-stats'
import { StatusSet, type StatusDef } from '../index.js'

const dot: StatusDef = {
  id: 'burn',
  durationTicks: 6,
  maxStacks: 3,
  periodic: { kind: 'dot', intervalTicks: 2, amount: 2 },
  control: 'stun',
  modifiers: [{ stat: 'armor', mode: 'add', value: -1 }],
}

const hot: StatusDef = {
  id: 'regen',
  durationTicks: 4,
  periodic: { kind: 'hot', intervalTicks: 2, amount: 1 },
}

describe('status set', () => {
  it('uses absolute tick expiry, stacks and refresh', () => {
    const set = new StatusSet()
    const first = set.apply(dot, 'enemy:2', 10)
    expect(first.expiresAt).toBe(16)
    const second = set.apply(dot, 'enemy:2', 12)
    expect(second.stacks).toBe(2)
    expect(second.expiresAt).toBe(18)
    expect(set.apply(dot, 'enemy:2', 13).stacks).toBe(3)
    expect(set.tick(17)).toHaveLength(2)
    expect(set.tick(18)).toHaveLength(0)
    expect(set.tick(19)).toHaveLength(0)
    expect(set.active).toHaveLength(0)
  })

  it('emits every due DoT/HoT period in ascending tick order', () => {
    const set = new StatusSet()
    set.apply(dot, 'enemy', 0)
    set.apply(hot, 'enemy', 0)
    const events = set.tick(4)
    expect(events.map((event) => [event.tick, event.kind, event.amount])).toEqual([
      [2, 'dot', 2],
      [2, 'hot', 1],
      [4, 'dot', 2],
    ])
    expect(events.filter((event) => event.status === 'burn')).toHaveLength(2)
  })

  it('removes by source and cleans modifiers/control flags', () => {
    const stats = new StatBlock([{ id: 'armor', base: 5 }])
    const set = new StatusSet()
    set.apply(dot, 'enemy:1', 0)
    set.syncModifiers(stats)
    expect(stats.value('armor')).toBe(4)
    expect(set.controls()).toEqual(['stun'])
    set.removeSource('enemy:1')
    set.syncModifiers(stats)
    expect(stats.value('armor')).toBe(5)
    expect(set.controls()).toEqual([])
  })

  it('clears all statuses on death without leaving stat sources', () => {
    const stats = new StatBlock([{ id: 'armor', base: 5 }])
    const set = new StatusSet()
    set.apply(dot, 'a', 0)
    set.apply(dot, 'b', 0)
    set.syncModifiers(stats)
    expect(stats.value('armor')).toBe(3)
    set.clear(stats)
    expect(set.active).toHaveLength(0)
    expect(stats.value('armor')).toBe(5)
  })

  it('serializes/restores stacks, timers, control and modifiers transparently', () => {
    const defs = { burn: dot, regen: hot }
    const originalStats = new StatBlock([{ id: 'armor', base: 5 }])
    const original = new StatusSet()
    original.apply(dot, 'enemy:2', 10)
    original.apply(dot, 'enemy:2', 12)
    original.apply(hot, 'enemy:2', 10)
    original.syncModifiers(originalStats)
    const snapshot = JSON.parse(JSON.stringify(original.serialize()))
    expect(snapshot.statuses).toHaveLength(2)

    const restoredStats = new StatBlock([{ id: 'armor', base: 5 }])
    const restored = new StatusSet()
    restored.restore(snapshot, defs, restoredStats)
    expect(restored.active).toEqual(original.active)
    expect(restored.controls()).toEqual(['stun'])
    expect(restoredStats.value('armor')).toBe(4)

    const continuousEvents = original.tick(17).map((event) => ({ ...event }))
    const restoredEvents = restored.tick(17).map((event) => ({ ...event }))
    expect(restoredEvents).toEqual(continuousEvents)
    expect(restored.active).toEqual(original.active)
    expect(restoredStats.value('armor')).toBe(originalStats.value('armor'))
  })

  it('fails restore for unknown status ids and duplicate sources', () => {
    const set = new StatusSet()
    expect(() => set.restore({
      version: 1,
      statuses: [{ status: 'missing', source: 'a', stacks: 1, appliedTick: 0, expiresAt: 1, nextTick: null }],
    }, { burn: dot })).toThrow(/unknown status/)
    expect(() => set.restore({
      version: 1,
      statuses: [
        { status: 'burn', source: 'a', stacks: 1, appliedTick: 0, expiresAt: 6, nextTick: 2 },
        { status: 'burn', source: 'a', stacks: 1, appliedTick: 0, expiresAt: 6, nextTick: 2 },
      ],
    }, { burn: dot })).toThrow(/repeats/)
  })
})
