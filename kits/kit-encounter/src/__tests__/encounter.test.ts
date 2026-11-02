import { describe, expect, it } from 'vitest'
import type { RngStateWords, RngStream } from '@lunego/core'
import { EncounterRuntime, type EncounterDef } from '../index.js'

function rng(seed: number): RngStream {
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

function statefulRng(seed: number): RngStream & {
  state(): RngStateWords
  restore(state: RngStateWords): void
} {
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
    state: () => [state, 0, 0, 1],
    restore: (words) => {
      state = words[0] >>> 0
    },
  }
}

const points = [{ x: 0, y: 0 }, { x: 2, y: 0 }]
const def: EncounterDef = {
  id: 'camp',
  budget: 10,
  leash: { origin: { x: 0, y: 0 }, radius: 5 },
  phases: [
    { id: 'normal', healthBelow: 1 },
    { id: 'enraged', healthBelow: 0.5 },
  ],
  lootTables: {
    common: { rarities: [{ id: 'common', weight: 1, minAffixes: 0, maxAffixes: 0 }], affixes: [] },
  },
  waves: [
    {
      id: 'one',
      count: 3,
      spawnPoints: points,
      spawnTable: {
        entries: [
          { id: 'slime', weight: 1, cost: 1, lootTable: 'common' },
          { id: 'bat', weight: 1, cost: 2 },
        ],
      },
    },
    {
      id: 'two',
      count: 1,
      spawnTable: { entries: [{ id: 'slime', weight: 1, cost: 1 }] },
      phase: 'boss',
    },
  ],
}

describe('encounter runtime', () => {
  it('is deterministic for fixed seed and injected spawn points', () => {
    const a = new EncounterRuntime({ def, rng: rng(7), spawnPoints: points })
    const b = new EncounterRuntime({ def, rng: rng(7), spawnPoints: points })
    expect(a.start()).toEqual(b.start())
    expect(a.spawned).toHaveLength(3)
    expect(a.spawned.map((entity) => entity.x)).toEqual([0, 2, 0])
    expect(a.spawned[0]?.contentId).toBe(b.spawned[0]?.contentId)
    expect(a.lootRequests).toEqual(['common'])
    expect(a.spent).toBeGreaterThan(0)
  })

  it('advances waves/phases and resets on leash', () => {
    const runtime = new EncounterRuntime({ def, rng: rng(3), spawnPoints: points })
    runtime.start()
    expect(runtime.phase).toBe('normal')
    const next = runtime.nextWave()
    expect(next.ok).toBe(true)
    expect(runtime.waveIndex).toBe(1)
    expect(runtime.phase).toBe('boss')
    expect(runtime.transitionPhase(0.4)).toBe('enraged')
    expect(runtime.checkLeash({ x: 100, y: 0 })).toBe(true)
    expect(runtime.waveIndex).toBe(0)
    expect(runtime.spawned).toHaveLength(0)
    expect(runtime.phase).toBe('normal')
    expect(runtime.checkLeash({ x: 1, y: 0 })).toBe(false)
  })

  it('returns an explicit budget failure without partial spawns', () => {
    const runtime = new EncounterRuntime({
      def: { ...def, budget: 1, waves: [{ ...def.waves[0]!, count: 2 }] },
      rng: rng(1),
      spawnPoints: points,
    })
    expect(runtime.start()).toEqual({ ok: false, reason: 'budget', spawned: [] })
    expect(runtime.spawned).toHaveLength(0)
    expect(runtime.spent).toBe(0)
  })

  it('serializes/restores wave, phase, spawned and spent', () => {
    const runtime = new EncounterRuntime({ def, rng: rng(9), spawnPoints: points })
    runtime.start()
    runtime.nextWave()
    runtime.transitionPhase(0.3)
    const state = JSON.parse(JSON.stringify(runtime.serialize()))
    const restored = new EncounterRuntime({ def, rng: rng(9), spawnPoints: points, state })
    expect(restored.serialize()).toEqual(runtime.serialize())
    expect(restored.phase).toBe('enraged')
    expect(restored.spawned).toHaveLength(runtime.spawned.length)
  })

  it('restores spawn RNG state so N/2 saves continue the exact spawn sequence', () => {
    const full = new EncounterRuntime({
      def,
      rng: statefulRng(21),
      spawnPoints: points,
    })
    const fullResults = [
      full.start(),
      full.nextWave(),
      full.spawnCurrentWave(),
      full.transitionPhase(0.4),
    ]

    const split = new EncounterRuntime({
      def,
      rng: statefulRng(21),
      spawnPoints: points,
    })
    split.start()
    split.nextWave()
    const state = JSON.parse(JSON.stringify(split.serialize()))
    expect(state.rngState).toHaveLength(4)

    const restored = new EncounterRuntime({
      def,
      rng: statefulRng(21),
      spawnPoints: points,
      state,
    })
    const rest = [restored.spawnCurrentWave(), restored.transitionPhase(0.4)]
    expect(rest).toEqual(fullResults.slice(2))
    expect(restored.spawned).toEqual(full.spawned)
    expect(restored.serialize()).toEqual(full.serialize())
  })

  it('accepts an externally restored state or requires an explicit restore hook', () => {
    const stateOnly = (words: RngStateWords): RngStream => ({
      ...rng(1),
      state: () => words,
    })
    const runtime = new EncounterRuntime({
      def,
      rng: stateOnly([9, 9, 9, 9]),
      spawnPoints: points,
    })
    runtime.start()
    const state = runtime.serialize()
    expect(state.rngState).toEqual([9, 9, 9, 9])
    expect(() => new EncounterRuntime({
      def,
      rng: stateOnly([1, 2, 3, 4]),
      spawnPoints: points,
      state,
    })).toThrow(/restoreRngState/)
    expect(new EncounterRuntime({
      def,
      rng: stateOnly([9, 9, 9, 9]),
      spawnPoints: points,
      state,
    }).serialize().rngState).toEqual([9, 9, 9, 9])
    let applied: RngStateWords | null = null
    new EncounterRuntime({
      def,
      rng: rng(1),
      spawnPoints: points,
      state,
      restoreRngState: (value) => {
        applied = value
      },
    })
    expect(applied).toEqual([9, 9, 9, 9])
  })

  it('applies injected difficulty scaling', () => {
    const runtime = new EncounterRuntime({
      def: { ...def, difficulty: { scaleCount: (base) => base + 1, scaleCost: (base) => base } },
      rng: rng(4),
      spawnPoints: points,
    })
    expect(runtime.start().spawned).toHaveLength(4)
  })
})
