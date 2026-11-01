import { describe, expect, it } from 'vitest'
import {
  LuneGoError,
  World,
  defineCommand,
  defineComponent,
  defineFeature,
  defineHandler,
  defineModel,
  defineQuery,
  defineSystem,
  guardError,
  ok,
  t,
} from '../index.js'

describe('models', () => {
  it('records leaf patches for nested drafts', () => {
    const Stats = defineModel(
      'Stats',
      { nested: t.struct({ kills: t.i32 }), list: t.array(t.i32) },
      { nested: { kills: 0 }, list: [] },
      { persist: 'world' },
    )
    const Bump = defineCommand('test.bump', {})
    const feature = defineFeature({
      name: 'stats',
      schema: { models: [Stats], commands: [Bump] },
      handlers: [
        defineHandler(Bump, {
          writes: [Stats],
          run(ctx) {
            const stats = ctx.mutModel(Stats)
            stats.nested.kills += 1
            stats.list.push(stats.nested.kills)
            return ok()
          },
        }),
      ],
    })
    const world = new World({ features: [feature] })
    const pending = world.send(Bump, {})
    const frame = world.step()
    void pending
    expect(world.model(Stats)).toEqual({ nested: { kills: 1 }, list: [1] })
    expect(frame.modelPatches).toEqual([
      { model: 'Stats', path: ['nested', 'kills'], value: 1 },
      { model: 'Stats', path: ['list'], value: [1] },
    ])
  })

  it('lets readers see writes made earlier in the same tick', () => {
    const Counter = defineModel('Counter', { value: t.i32 }, { value: 0 })
    const Seen = defineModel(
      'Seen',
      { values: t.array(t.i32) },
      { values: [] },
    )
    const writer = defineSystem({
      name: 'model.writer',
      phase: 'update',
      writes: [Counter],
      run(ctx) {
        ctx.mutModel(Counter).value += 1
      },
    })
    const reader = defineSystem({
      name: 'model.reader',
      phase: 'update',
      reads: [Counter],
      writes: [Seen],
      after: [writer],
      run(ctx) {
        ctx.mutModel(Seen).values.push(ctx.model(Counter).value)
      },
    })
    const feature = defineFeature({
      name: 'model-order',
      schema: { models: [Counter, Seen] },
      systems: [reader, writer],
    })
    const world = new World({ features: [feature] })
    world.step()
    world.step()
    expect(world.model(Seen)).toEqual({ values: [1, 2] })
  })

  it('keeps read-only views safe outside a tick', () => {
    const Wallet = defineModel('Wallet', { gold: t.i32 }, { gold: 1 })
    const feature = defineFeature({ name: 'wallet', schema: { models: [Wallet] } })
    const world = new World({ features: [feature] })
    const model = world.model(Wallet)
    expect(() => {
      model.gold = 5
    }).toThrow(/read-only/)
  })

  it('rejects stale model drafts after their tick', () => {
    const Wallet = defineModel('Wallet', { gold: t.i32 }, { gold: 1 })
    let stale: { gold: number } | null = null
    const writer = defineSystem({
      name: 'model.capture',
      phase: 'update',
      writes: [Wallet],
      run(ctx) {
        stale = ctx.mutModel(Wallet)
      },
    })
    const feature = defineFeature({
      name: 'wallet-capture',
      schema: { models: [Wallet] },
      systems: [writer],
    })
    const world = new World({ features: [feature] })
    world.step()
    expect(stale).not.toBeNull()
    try {
      if (stale !== null) {
        stale.gold = 99
      }
      throw new Error('expected stale draft write to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(LuneGoError)
      if (error instanceof LuneGoError) {
        expect(error.rule).toBe('LG004')
      }
    }
    expect(world.model(Wallet).gold).toBe(1)
  })

  it('runs read-only queries through ctx.call', () => {
    const Value = defineComponent('QueryValue', { value: t.i32 }, { persist: 'world' })
    const Total = defineModel('QueryTotal', { sum: t.i32 }, { sum: 0 })
    const sumQuery = defineQuery({
      name: 'query.sum',
      reads: [Value],
      run(ctx) {
        const view = ctx.read(Value)
        let sum = 0
        for (const entity of ctx.query(Value)) {
          sum += view.value[entity]
        }
        return sum
      },
    })
    const accumulate = defineSystem({
      name: 'query.accumulate',
      phase: 'update',
      writes: [Total],
      run(ctx) {
        ctx.mutModel(Total).sum = ctx.call(sumQuery, undefined)
      },
    })
    const feature = defineFeature({
      name: 'query',
      schema: { components: [Value], models: [Total] },
      systems: [accumulate],
      queries: [sumQuery],
    })
    const world = new World({ features: [feature] })
    world.spawn({ QueryValue: { value: 2 } })
    world.spawn({ QueryValue: { value: 3 } })
    world.step()
    expect(world.model(Total).sum).toBe(5)
  })

  it('exposes guard errors with rule ids', () => {
    const error = guardError('LG003', 'missing declaration')
    expect(error.rule).toBe('LG003')
    expect(error.code).toBe('guard_violation')
  })
})
