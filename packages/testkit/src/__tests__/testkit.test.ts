import { describe, expect, it } from 'vitest'
import {
  defineCommand,
  defineComponent,
  defineEvent,
  defineFeature,
  defineHandler,
  defineModel,
  defineSystem,
  ok,
  t,
} from '@lunego/core'
import {
  TestWorld,
  assertDeterministic,
  assertSaveLoadTransparent,
  testWorld,
  verifyReplay,
  type ReplayCommand,
  type ReplayLog,
} from '../index.js'

const Health = defineComponent(
  'Health',
  { current: t.i32, max: t.i32 },
  { persist: 'world' },
)
const Damaged = defineEvent('testkit.damaged', {
  target: t.entity,
  amount: t.i32,
})
const Died = defineEvent('testkit.died', { entity: t.entity })

const healthFeature = defineFeature({
  name: 'health',
  schema: { components: [Health], events: [Damaged, Died] },
  systems: [
    defineSystem({
      name: 'health.damage',
      phase: 'update',
      writes: [Health],
      emits: [Died],
      listens: [Damaged],
      run(ctx) {
        const health = ctx.write(Health)
        for (const payload of ctx.events(Damaged)) {
          health.current[payload.target] -= payload.amount
          if (health.current[payload.target] <= 0) {
            ctx.emit(Died, { entity: payload.target })
          }
        }
      },
    }),
  ],
})

describe('testkit', () => {
  it('spawns, emits, steps and exposes events and queries', () => {
    const world = testWorld({ features: [healthFeature] })
    const entity = world.spawn({ Health: { current: 10, max: 10 } })
    world.emit(Damaged, { target: entity, amount: 15 })
    world.step()
    expect(world.events(Died)).toEqual([{ entity }])
    expect(world.get(entity, Health)?.current).toBe(-5)
    expect(world.query(Health)).toEqual([entity])
  })

  it('runs a scenario twice with identical hashes', () => {
    const Position = defineComponent(
      'KitPosition',
      { x: t.f32, y: t.f32 },
      { persist: 'world' },
    )
    const Counter = defineModel(
      'KitCounter',
      { value: t.i32 },
      { value: 0 },
      { persist: 'world' },
    )
    const Nudge = defineCommand('kit.nudge', { dx: t.f32 })
    const feature = defineFeature({
      name: 'kit-determinism',
      schema: { components: [Position], models: [Counter], commands: [Nudge] },
      systems: [
        defineSystem({
          name: 'kit.move',
          phase: 'update',
          writes: [Position, Counter],
          run(ctx) {
            const view = ctx.write(Position)
            for (const entity of ctx.query(Position)) {
              view.x[entity] += ctx.rng('kit').float(0, 1)
            }
            ctx.mutModel(Counter).value += 1
          },
        }),
      ],
      handlers: [
        defineHandler(Nudge, {
          writes: [Position],
          run(ctx, payload) {
            const view = ctx.write(Position)
            for (const entity of ctx.query(Position)) {
              view.x[entity] += payload.dx
            }
            return ok()
          },
        }),
      ],
    })
    const scenario = {
      features: [feature],
      ticks: 6,
      seed: 4,
      onTick: (world: TestWorld, tick: number) => {
        if (tick === 1) {
          world.spawn({ KitPosition: { x: 0, y: 0 } })
        }
        if (tick === 4) {
          void world.send(Nudge, { dx: 2 })
        }
      },
    }
    const result = assertDeterministic(scenario)
    expect(result.hashes).toHaveLength(6)
  })

  it('checks save/load transparency for a scenario', () => {
    const Value = defineModel(
      'KitValue',
      { value: t.i32 },
      { value: 0 },
      { persist: 'world' },
    )
    const Nudge = defineCommand('kit.saveNudge', { amount: t.i32 })
    const feature = defineFeature({
      name: 'kit-save',
      schema: { models: [Value], commands: [Nudge] },
      systems: [
        defineSystem({
          name: 'kit.advance',
          phase: 'update',
          writes: [Value],
          run(ctx) {
            ctx.mutModel(Value).value += ctx.rng('advance').int(1, 5)
          },
        }),
      ],
      handlers: [
        defineHandler(Nudge, {
          writes: [Value],
          run(ctx, payload) {
            ctx.mutModel(Value).value += payload.amount
            return ok()
          },
        }),
      ],
    })
    const scenario = {
      features: [feature],
      ticks: 7,
      seed: 12,
      onTick: (world: TestWorld, tick: number) => {
        if (tick === 3 || tick === 6) {
          void world.send(Nudge, { amount: 10 })
        }
      },
    }
    const result = assertSaveLoadTransparent(scenario)
    expect(result.resumedHashes).toHaveLength(4)
    expect(result.full.hash).toBe(result.resumedHashes[result.resumedHashes.length - 1])
  })

  it('replays a command log and verifies checkpoints', () => {
    const Score = defineModel(
      'KitScore',
      { value: t.i32 },
      { value: 0 },
      { persist: 'world' },
    )
    const Add = defineCommand('kit.add', { amount: t.i32 })
    const feature = defineFeature({
      name: 'kit-replay',
      schema: { models: [Score], commands: [Add] },
      handlers: [
        defineHandler(Add, {
          writes: [Score],
          run(ctx, payload) {
            ctx.mutModel(Score).value += payload.amount
            return ok()
          },
        }),
      ],
    })
    const original = testWorld({ features: [feature], seed: 8 })
    const initial = original.snapshot()
    const checkpoints: Array<{ tick: number; hash: string }> = []
    original.step()
    checkpoints.push({ tick: 1, hash: original.hash() })
    void original.send(Add, { amount: 4 })
    original.step()
    checkpoints.push({ tick: 2, hash: original.hash() })
    original.step()
    checkpoints.push({ tick: 3, hash: original.hash() })

    const commands: ReplayCommand[] = original.commandLog.map((entry) => ({
      tick: entry.tick,
      type: entry.type,
      payload: entry.payload,
      ...(typeof entry.source === 'number' ? { source: entry.source } : {}),
    }))
    const log: ReplayLog = {
      endTick: 3,
      snapshot: initial,
      commands,
      checkpoints,
    }
    const result = verifyReplay(log, { features: [feature] })
    expect(result.hashes.get(3)).toBe(checkpoints[2]?.hash)
    expect(result.world.model(Score).value).toBe(4)

    const broken: ReplayLog = {
      ...log,
      checkpoints: [{ tick: 2, hash: 'deadbeefdeadbeef' }],
    }
    expect(() => verifyReplay(broken, { features: [feature] })).toThrow(/checkpoint mismatch/)
  })

  it('can wrap a restored world', () => {
    const Score = defineModel(
      'KitRestoreScore',
      { value: t.i32 },
      { value: 0 },
      { persist: 'world' },
    )
    const feature = defineFeature({
      name: 'kit-restore',
      schema: { models: [Score] },
    })
    const world = testWorld({ features: [feature] })
    const snapshot = world.snapshot()
    const restored = TestWorld.fromSnapshot(snapshot, {
      features: [feature],
      schemaVersion: 1,
    })
    expect(restored.hash()).toBe(world.hash())
  })
})
