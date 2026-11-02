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
  defineState,
  defineSystem,
  defineTag,
  ok,
  t,
  without,
} from '../index.js'
import type { LogEntry } from '../index.js'

const Position = defineComponent('ContractPosition', { x: t.f32 })
const Marker = defineTag('ContractMarker')
const Counter = defineModel('ContractCounter', { n: t.i32 }, { n: 0 }, { persist: 'world' })

describe('contract shape', () => {
  it('records the replicate flag on events', () => {
    expect(defineEvent('ContractBare', { n: t.i32 }).replicate).toBe(false)
    expect(defineEvent('ContractReplicated', { n: t.i32 }, { replicate: true }).replicate).toBe(
      true,
    )
  })

  it('merges generated registry entries into the feature', () => {
    const system = defineSystem({
      name: 'registry.system',
      phase: 'update',
      writes: [Counter],
      run(ctx) {
        ctx.mutModel(Counter).n += 1
      },
    })
    const feature = defineFeature({
      name: 'registry-feature',
      schema: { models: [Counter] },
      registry: { systems: [system] },
    })
    const world = new World({ features: [feature] })
    world.step()
    expect(world.model(Counter).n).toBe(1)
  })

  it('exposes deterministic math, time and routed logging', () => {
    const entries: LogEntry[] = []
    const system = defineSystem({
      name: 'services.system',
      phase: 'update',
      run(ctx) {
        const value = ctx.math.sin(ctx.math.PI / 2)
        ctx.log.info('math', { value, tick: ctx.time.tick })
      },
    })
    const feature = defineFeature({ name: 'services', systems: [system] })
    const world = new World({
      features: [feature],
      onLog: (entry) => entries.push(entry),
    })
    world.step()
    expect(entries).toHaveLength(1)
    expect(entries[0]?.level).toBe('info')
    expect(entries[0]?.context).toBe('services.system')
    expect(entries[0]?.tick).toBe(1)
    expect(entries[0]?.data).toEqual({ value: expect.closeTo(1, 4), tick: 1 })
  })

  it('runs state hooks and gates systems by state', () => {
    const transitions: string[] = []
    const Mode = defineState('contract.mode', ['boot', 'playing'], {
      initial: 'boot',
      onExit: {
        boot: {
          run: (_ctx, transition) => {
            transitions.push(`exit:${transition.from}`)
          },
        },
      },
      onEnter: {
        playing: {
          writes: [Counter],
          run: (ctx, transition) => {
            transitions.push(`enter:${transition.from}->${transition.to}`)
            ctx.mutModel(Counter).n += 10
          },
        },
      },
    })
    const Start = defineCommand('contract.start', {})
    const handler = defineHandler(Start, {
      writes: [Mode],
      run(ctx) {
        ctx.setState(Mode, 'playing')
        return ok()
      },
    })
    const gate = defineSystem({
      name: 'contract.gate',
      phase: 'update',
      reads: [Mode],
      writes: [Counter],
      runIf: (ctx) => ctx.state(Mode) === 'playing',
      run(ctx) {
        ctx.mutModel(Counter).n += 1
      },
    })
    const feature = defineFeature({
      name: 'flow',
      schema: { models: [Counter], commands: [Start], states: [Mode] },
      systems: [gate],
      handlers: [handler],
    })
    const world = new World({ features: [feature] })
    world.step()
    expect(world.model(Counter).n).toBe(0)
    void world.send(Start, {})
    world.step()
    expect(world.model(Counter).n).toBe(10)
    expect(transitions).toEqual(['exit:boot', 'enter:boot->playing'])
    world.step()
    expect(world.model(Counter).n).toBe(11)
  })

  it('rejects undeclared components in ctx.query, including filters', () => {
    const system = defineSystem({
      name: 'query.undeclared',
      phase: 'update',
      writes: [Position],
      run(ctx) {
        ctx.query(Position, without(Marker))
      },
    })
    const feature = defineFeature({
      name: 'query-guard',
      schema: { components: [Position], tags: [Marker] },
      systems: [system],
    })
    const world = new World({ features: [feature] })
    world.spawn({ ContractPosition: { x: 1 } })
    expect(() => world.step()).toThrow(LuneGoError)
    expect(() => world.step()).toThrow(/Marker/)
  })

  it('freezes event payloads so listeners cannot poison later reads', () => {
    const Ping = defineEvent('contract.ping', { n: t.i32 })
    const emitted = defineSystem({
      name: 'ping.emit',
      phase: 'update',
      emits: [Ping],
      run(ctx) {
        ctx.emit(Ping, { n: 1 })
      },
    })
    const feature = defineFeature({
      name: 'ping',
      schema: { events: [Ping] },
      systems: [emitted],
    })
    const world = new World({ features: [feature] })
    world.step()
    const payload = world.frame.events[0]?.payload as { n: number }
    expect(Object.isFrozen(payload)).toBe(true)
    expect(() => {
      payload.n = 9
    }).toThrow(TypeError)
    expect(payload.n).toBe(1)
    expect(Object.isFrozen(world.frame.events)).toBe(true)
  })

  it('validates model and component writes in dev mode', () => {
    const modelSystem = defineSystem({
      name: 'bad.model',
      phase: 'update',
      writes: [Counter],
      run(ctx) {
        ctx.mutModel(Counter).n = 1.5
      },
    })
    const modelFeature = defineFeature({
      name: 'bad-model',
      schema: { models: [Counter] },
      systems: [modelSystem],
    })
    const modelWorld = new World({ features: [modelFeature] })
    expect(() => modelWorld.step()).toThrow(/schema mismatch/)

    const componentSystem = defineSystem({
      name: 'bad.component',
      phase: 'update',
      writes: [Position],
      run(ctx) {
        const view = ctx.write(Position)
        for (const entity of ctx.query(Position)) {
          view.x[entity] = Number.POSITIVE_INFINITY
        }
      },
    })
    const componentFeature = defineFeature({
      name: 'bad-component',
      schema: { components: [Position], tags: [Marker] },
      systems: [
        defineSystem({
          name: 'bad.query',
          phase: 'update',
          reads: [Position, Marker],
          run(ctx) {
            for (const entity of ctx.query(Position, without(Marker))) {
              void entity
            }
          },
        }),
        componentSystem,
      ],
    })
    const componentWorld = new World({ features: [componentFeature] })
    componentWorld.spawn({ ContractPosition: { x: 0 } })
    expect(() => componentWorld.step()).toThrow(/schema mismatch/)
  })
})

describe('read surface', () => {
  it('returns read-only copies of compound state', () => {
    const Box = defineComponent('ContractBox', { items: t.array(t.i32) }, { persist: 'world' })
    const feature = defineFeature({ name: 'box', schema: { components: [Box] } })
    const world = new World({ features: [feature] })
    const entity = world.spawn({ ContractBox: { items: [1] } })
    const copy = world.get(entity, Box) as { items: number[] }
    copy.items.push(2)
    expect(world.get(entity, Box)).toEqual({ items: [1] })
    expect(() => {
      ;(world.get(entity, Box) as { items: number[] }).items.push(3)
    }).not.toThrow()
  })
})
