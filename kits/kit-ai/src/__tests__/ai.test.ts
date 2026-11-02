import { describe, expect, it } from 'vitest'
import {
  AgentGroup,
  Blackboard,
  Perception,
  ThreatTable,
  btAction,
  btCondition,
  btSelector,
  btSequence,
  selectUtility,
  transitionPhase,
  withinLeash,
} from '../index.js'

const self = { entity: 1, x: 0, y: 0 }
const left = { entity: 3, x: -2, y: 0 }
const right = { entity: 2, x: 2, y: 0 }

describe('ai perception and threat', () => {
  it('respects cone, range and tick memory with stable entity order', () => {
    const perception = new Perception({ range: 5, coneDot: 0, memoryTicks: 2 })
    expect(perception.observe(self, { x: 1, y: 0 }, [right, left], 10).map((entry) => entry.entity)).toEqual([2])
    expect(perception.observe(self, { x: 1, y: 0 }, [left], 11).map((entry) => entry.entity)).toEqual([2])
    expect(perception.snapshot(12).map((entry) => entry.entity)).toEqual([2])
    expect(perception.snapshot(13)).toEqual([])
  })

  it('applies an injected line-of-sight callback without changing range/cone rules', () => {
    const blocked = { entity: 4, x: 1, y: 0 }
    const visible = { entity: 2, x: 1, y: 0 }
    const perception = new Perception({
      range: 10,
      coneDot: 0,
      lineOfSight: (_self, candidate) => candidate.entity !== blocked.entity,
    })
    expect(perception.observe(self, { x: 1, y: 0 }, [blocked, visible], 1).map((entry) => entry.entity)).toEqual([2])
    expect(perception.snapshot(1).map((entry) => entry.entity)).toEqual([2])

    const open = new Perception({ range: 10, coneDot: 0 })
    expect(open.observe(self, { x: 1, y: 0 }, [blocked, visible], 1).map((entry) => entry.entity)).toEqual([2, 4])
  })

  it('ranks threat descending then entity ascending and hides blacklisted', () => {
    const table = new ThreatTable()
    table.add(5, 3)
    table.add(2, 3)
    table.add(9, 1)
    table.blacklist(5)
    expect(table.ranked()).toEqual([{ entity: 2, threat: 3 }, { entity: 9, threat: 1 }])
  })

  it('breaks utility ties by action id', () => {
    const selected = selectUtility(
      [
        { id: 'b', score: () => 1 },
        { id: 'a', score: () => 1 },
        { id: 'c', score: () => 0 },
      ],
      {},
    )
    expect(selected?.id).toBe('a')
  })

  it('restores perception memory and seen state with explicit dead-ref failures', () => {
    const original = new Perception({ range: 5, coneDot: -1, memoryTicks: 2 })
    original.observe(self, { x: 1, y: 0 }, [right], 10)
    original.observe(self, { x: 1, y: 0 }, [left], 10)
    const snapshot = JSON.parse(JSON.stringify(original.serialize()))
    const restored = new Perception({ range: 5, coneDot: -1, memoryTicks: 2 })
    restored.restore(snapshot)
    expect(restored.serialize()).toEqual({
      version: 1,
      memory: [
        { entity: 2, x: 2, y: 0, lastSeenTick: 10 },
        { entity: 3, x: -2, y: 0, lastSeenTick: 10 },
      ],
      seen: [2, 3],
    })
    expect(restored.snapshot(11).map((entry) => entry.entity)).toEqual([2, 3])
    expect(() => restored.restore(snapshot, { isValidEntity: (entity) => entity !== 3 })).toThrow(/unknown or dead entity/)
    expect(() => restored.restore(snapshot, { isValidEntity: () => false })).toThrow(/unknown or dead entity/)
  })

  it('restores threat values including blacklisted entries and rejects dead refs', () => {
    const table = new ThreatTable()
    table.add(5, 3)
    table.add(2, 3)
    table.blacklist(5)
    const snapshot = JSON.parse(JSON.stringify(table.serialize()))
    const restored = new ThreatTable()
    restored.restore(snapshot)
    expect(restored.ranked()).toEqual([{ entity: 2, threat: 3 }])
    expect(restored.isBlacklisted(5)).toBe(true)
    expect(restored.serialize()).toEqual(snapshot)
    expect(() => restored.restore(snapshot, { isValidEntity: (entity) => entity !== 5 })).toThrow(/unknown or dead entity/)
  })
})

describe('ai brain primitives', () => {
  it('runs sequence/selector deterministically', () => {
    const calls: string[] = []
    const tree = btSelector(
      btSequence(
        btCondition(() => false),
        btAction(() => { calls.push('never') }),
      ),
      btAction(() => { calls.push('fallback') }),
    )
    expect(tree.run({})).toBe('success')
    expect(calls).toEqual(['fallback'])
  })

  it('keeps group members and blackboard values sorted/copied', () => {
    const group = new AgentGroup<{ entity: number; x: number; y: number }>()
    group.add({ entity: 3, x: 1, y: 1 })
    group.add({ entity: 1, x: 5, y: 5 })
    expect(group.values().map((member) => member.entity)).toEqual([1, 3])
    expect(group.nearest({ x: 0, y: 0 })?.entity).toBe(3)
    const tied = new AgentGroup<{ entity: number; x: number; y: number }>()
    tied.add({ entity: 3, x: -1, y: 0 })
    tied.add({ entity: 2, x: 1, y: 0 })
    expect(tied.nearest({ x: 0, y: 0 })?.entity).toBe(2)
    const board = new Blackboard({ target: 0 })
    board.set('target', 3)
    expect(board.snapshot()).toEqual({ target: 3 })
    board.restore({ target: 7 })
    expect(board.snapshot()).toEqual({ target: 7 })
    const loose = new Blackboard<Record<string, unknown>>({ target: 0 })
    expect(() => loose.restore({ other: 1 })).toThrow(/missing key target/)
    expect(() => loose.restore({ target: 1, extra: 2 })).toThrow(/unknown key extra/)
  })
})

describe('enemy phase example', () => {
  it('patrols, detects, chases, attacks, loses and disengages deterministically', () => {
    type Phase = 'patrol' | 'chase' | 'attack' | 'disengage'
    const perception = new Perception({ range: 6, coneDot: -0.5, memoryTicks: 2 })
    const leash = { origin: { x: 0, y: 0 }, radius: 10 }
    let phase: Phase = 'patrol'
    let since = 0
    let lastSeen = 0
    const step = (tick: number, enemy: { entity: number; x: number; y: number } | null, selfPos = self): string => {
      if (!withinLeash(leash, selfPos)) {
        phase = 'disengage'
        since = transitionPhase({ phase, sinceTick: since }, phase, tick).sinceTick
        return phase
      }
      const seen = perception.observe(selfPos, { x: 1, y: 0 }, enemy === null ? [] : [enemy], tick)
      const target = seen.find((entry) => entry.visible) ?? null
      if (target !== null) {
        lastSeen = tick
      }
      const next: Phase = target === null
        ? (tick - lastSeen > 2 ? 'patrol' : phase)
        : Math.abs(target.x - selfPos.x) + Math.abs(target.y - selfPos.y) <= 1
          ? 'attack'
          : 'chase'
      if (next !== phase) {
        since = transitionPhase({ phase, sinceTick: since }, next, tick).sinceTick
        phase = next
      }
      return phase
    }
    expect(step(1, null)).toBe('patrol')
    expect(step(2, { entity: 2, x: 4, y: 0 })).toBe('chase')
    expect(step(3, { entity: 2, x: 1, y: 0 })).toBe('attack')
    expect(step(4, null)).toBe('attack')
    expect(step(7, null)).toBe('patrol')
    expect(step(8, null, { x: 20, y: 0 })).toBe('disengage')
  })
})
