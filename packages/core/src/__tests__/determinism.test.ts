import { describe, expect, it } from 'vitest'
import {
  LuneGoError,
  World,
  defineCommand,
  defineComponent,
  defineEvent,
  defineFeature,
  defineHandler,
  defineModel,
  defineSystem,
  ok,
  t,
  type FeatureDef,
  type WorldSnapshot,
} from '../index.js'

const Position = defineComponent(
  'DetPosition',
  { x: t.f32, y: t.f32 },
  { persist: 'world' },
)
const Velocity = defineComponent(
  'DetVelocity',
  { x: t.f32, y: t.f32 },
  { persist: 'world' },
)
const Counter = defineModel(
  'DetCounter',
  { value: t.i32 },
  { value: 0 },
  { persist: 'world' },
)
const Journal = defineModel(
  'DetJournal',
  { entries: t.array(t.str) },
  { entries: [] },
  { persist: 'world' },
)
const Beat = defineEvent('det.beat', { tick: t.i32 })
const Nudge = defineCommand('det.nudge', { dx: t.f32, dy: t.f32 })

function createFeature(): FeatureDef {
  const integrate = defineSystem({
    name: 'det.integrate',
    phase: 'update',
    reads: [Velocity],
    writes: [Position],
    run(ctx) {
      const position = ctx.write(Position)
      const velocity = ctx.read(Velocity)
      for (const entity of ctx.query(Position, Velocity)) {
        position.x[entity] += velocity.x[entity] * ctx.time.dt
        position.y[entity] += velocity.y[entity] * ctx.time.dt
      }
    },
  })
  const bump = defineSystem({
    name: 'det.bump',
    phase: 'update',
    writes: [Counter],
    run(ctx) {
      ctx.mutModel(Counter).value += ctx.rng('tick').int(1, 3)
    },
  })
  const emitBeat = defineSystem({
    name: 'det.emitBeat',
    phase: 'pre',
    emits: [Beat],
    run(ctx) {
      ctx.emit(Beat, { tick: ctx.tick })
    },
  })
  const readPrevious = defineSystem({
    name: 'det.readPrevious',
    phase: 'update',
    writes: [Journal],
    listens: [{ event: Beat, prev: true }],
    run(ctx) {
      for (const payload of ctx.prev(Beat)) {
        ctx.mutModel(Journal).entries.push(`beat-${payload.tick}`)
      }
    },
  })
  const nudge = defineHandler(Nudge, {
    writes: [Velocity],
    run(ctx, payload) {
      const velocity = ctx.write(Velocity)
      for (const entity of ctx.query(Velocity)) {
        velocity.x[entity] += payload.dx
        velocity.y[entity] += payload.dy
      }
      return ok()
    },
  })
  return defineFeature({
    name: 'determinism',
    schema: {
      components: [Position, Velocity],
      models: [Counter, Journal],
      events: [Beat],
      commands: [Nudge],
    },
    systems: [integrate, bump, emitBeat, readPrevious],
    handlers: [nudge],
  })
}

function createWorld(seed: number): World {
  const world = new World({ features: [createFeature()], seed })
  world.spawn({
    DetPosition: { x: 0, y: 0 },
    DetVelocity: { x: 2, y: -1 },
  })
  return world
}

function runTicks(world: World, from: number, to: number, hashes: string[]): void {
  for (let tick = from; tick <= to; tick += 1) {
    if (tick === 2 || tick === 5 || tick === 8) {
      void world.send(Nudge, { dx: 1, dy: 0.5 })
    }
    world.step()
    hashes.push(world.hash())
  }
}

describe('determinism', () => {
  it('produces identical hashes for identical seed and command sequence', () => {
    const first = createWorld(123)
    const second = createWorld(123)
    const firstHashes: string[] = []
    const secondHashes: string[] = []
    runTicks(first, 1, 10, firstHashes)
    runTicks(second, 1, 10, secondHashes)
    expect(firstHashes).toHaveLength(10)
    expect(firstHashes).toEqual(secondHashes)
    expect(first.hash()).toBe(second.hash())
  })

  it('changes state when only the seed differs', () => {
    const first = createWorld(1)
    const second = createWorld(2)
    first.step()
    second.step()
    expect(first.hash()).not.toBe(second.hash())
  })

  it('keeps named RNG streams independent', () => {
    const first = new World({ features: [createFeature()], seed: 77 })
    const second = new World({ features: [createFeature()], seed: 77 })
    const third = new World({ features: [createFeature()], seed: 77 })
    first.rngStream('loot').int(0, 1000)
    const fromSecond = second.rngStream('ai').int(0, 1000)
    const fromThird = third.rngStream('ai').int(0, 1000)
    expect(fromSecond).toBe(fromThird)
  })

  it('is transparent across save and load', () => {
    const full = createWorld(999)
    const fullHashes: string[] = []
    runTicks(full, 1, 10, fullHashes)

    const split = createWorld(999)
    const before: string[] = []
    runTicks(split, 1, 5, before)
    expect(before).toEqual(fullHashes.slice(0, 5))

    const snapshot = split.snapshot()
    const json = JSON.parse(JSON.stringify(snapshot)) as WorldSnapshot
    const restored = World.fromSnapshot(json, {
      features: [createFeature()],
      schemaVersion: 1,
    })
    expect(restored.hash()).toBe(split.hash())

    const after: string[] = []
    runTicks(restored, 6, 10, after)
    expect(after).toEqual(fullHashes.slice(5))
  })

  it('restores entity generation and free slot allocation', () => {
    const world = createWorld(5)
    const extra = world.spawn({ DetPosition: { x: 5, y: 5 } })
    world.despawn(extra)
    world.step()
    const snapshot = JSON.parse(JSON.stringify(world.snapshot())) as WorldSnapshot
    const restored = World.fromSnapshot(snapshot, {
      features: [createFeature()],
      schemaVersion: 1,
    })
    const originalNext = world.spawn({ DetPosition: { x: 1, y: 1 } })
    const restoredNext = restored.spawn({ DetPosition: { x: 1, y: 1 } })
    expect(restoredNext).toBe(originalNext)
    expect(restored.hash()).toBe(world.hash())
  })

  it('rejects a snapshot loaded with a different schema version', () => {
    const world = createWorld(5)
    world.step()
    const snapshot = world.snapshot()
    try {
      World.fromSnapshot(snapshot, {
        features: [createFeature()],
        schemaVersion: 2,
      })
      throw new Error('expected schema version mismatch')
    } catch (error) {
      expect(error).toBeInstanceOf(LuneGoError)
      if (error instanceof LuneGoError) {
        expect(error.rule).toBe('LG010')
        expect(error.code).toBe('schema_version_mismatch')
      }
    }
  })
})
