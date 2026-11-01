import { describe, expect, it } from 'vitest'
import {
  LuneGoError,
  World,
  defineComponent,
  defineFeature,
  defineInvariant,
  defineModel,
  defineSystem,
  defineTag,
  guardError,
  t,
  type ComponentView,
  type SystemContext,
} from '../index.js'
import { Position } from './fixtures.js'

function capture(action: () => void): unknown {
  try {
    action()
  } catch (error) {
    return error
  }
  throw new Error('expected action to throw')
}

function expectRule(error: unknown, rule: string): void {
  expect(error).toBeInstanceOf(LuneGoError)
  if (error instanceof LuneGoError) {
    expect(error.rule).toBe(rule)
  }
}

describe('runtime guards', () => {
  it('rejects reading an undeclared component (LG003)', () => {
    const feature = defineFeature({
      name: 'undeclared-read',
      schema: { components: [Position] },
      systems: [
        defineSystem({
          name: 'guard.undeclaredRead',
          phase: 'update',
          run(ctx) {
            ctx.read(Position)
          },
        }),
      ],
    })
    const world = new World({ features: [feature] })
    world.spawn({ Position: { x: 0, y: 0 } })
    expectRule(capture(() => world.step()), 'LG003')
  })

  it('rejects undeclared model writes (LG003)', () => {
    const Wallet = defineModel('Wallet', { gold: t.i32 }, { gold: 0 })
    const feature = defineFeature({
      name: 'undeclared-write',
      schema: { models: [Wallet] },
      systems: [
        defineSystem({
          name: 'guard.undeclaredWrite',
          phase: 'update',
          run(ctx) {
            ctx.mutModel(Wallet)
          },
        }),
      ],
    })
    const world = new World({ features: [feature] })
    expectRule(capture(() => world.step()), 'LG003')
  })

  it('rejects writing through a context after its tick (LG004)', () => {
    let captured: SystemContext | null = null
    const feature = defineFeature({
      name: 'captured-context',
      schema: { components: [Position] },
      systems: [
        defineSystem({
          name: 'guard.capture',
          phase: 'update',
          reads: [Position],
          writes: [Position],
          run(ctx) {
            captured = ctx
          },
        }),
      ],
    })
    const world = new World({ features: [feature] })
    world.spawn({ Position: { x: 0, y: 0 } })
    world.step()
    expectRule(
      capture(() => {
        captured?.write(Position)
      }),
      'LG004',
    )
  })

  it('rejects writing through a read-only component view (LG004)', () => {
    let captured: ComponentView<{ x: typeof t.f32 }> | null = null
    const Single = defineComponent('Single', { x: t.f32 })
    const feature = defineFeature({
      name: 'readonly-view',
      schema: { components: [Single] },
      systems: [
        defineSystem({
          name: 'guard.view',
          phase: 'update',
          reads: [Single],
          run(ctx) {
            captured = ctx.read(Single)
          },
        }),
      ],
    })
    const world = new World({ features: [feature] })
    const entity = world.spawn({ Single: { x: 1 } })
    world.step()
    expectRule(
      capture(() => {
        if (captured !== null) {
          captured.x[entity] = 2
        }
      }),
      'LG004',
    )
    expect(world.get(entity, Single)).toEqual({ x: 1 })
  })

  it('rejects writes to state owned by another feature (LG005)', () => {
    const owner = defineFeature({
      name: 'owner',
      schema: { components: [Position] },
    })
    const intruder = defineFeature({
      name: 'intruder',
      deps: [owner],
      systems: [
        defineSystem({
          name: 'intruder.write',
          phase: 'update',
          writes: [Position],
          run(ctx) {
            ctx.write(Position)
          },
        }),
      ],
    })
    expectRule(
      capture(() => {
        new World({ features: [owner, intruder] })
      }),
      'LG005',
    )
  })

  it('allows a declared additional writer', () => {
    const Shared = defineComponent(
      'Shared',
      { value: t.i32 },
      { writers: ['intruder'] },
    )
    const owner = defineFeature({
      name: 'owner',
      schema: { components: [Shared] },
    })
    const intruder = defineFeature({
      name: 'intruder',
      deps: [owner],
      systems: [
        defineSystem({
          name: 'intruder.writeShared',
          phase: 'update',
          writes: [Shared],
          run(ctx) {
            const view = ctx.write(Shared)
            for (const entity of ctx.query(Shared)) {
              view.value[entity] += 1
            }
          },
        }),
      ],
    })
    const world = new World({ features: [owner, intruder] })
    const entity = world.spawn({ Shared: { value: 1 } })
    world.step()
    expect(world.get(entity, Shared)).toEqual({ value: 2 })
  })

  it('rejects undeclared emitted events and cues (LG003)', () => {
    const Marker = defineTag('test.marker')
    const missingEvent = defineFeature({
      name: 'missing-event',
      schema: { tags: [Marker] },
      systems: [
        defineSystem({
          name: 'guard.emit',
          phase: 'update',
          run(ctx) {
            ctx.emit({ kind: 'event', name: 'test.unregistered', schema: null }, undefined)
          },
        }),
      ],
    })
    const world = new World({ features: [missingEvent] })
    expectRule(capture(() => world.step()), 'LG003')
    const noCue = defineFeature({
      name: 'missing-cue',
      schema: {},
      systems: [
        defineSystem({
          name: 'guard.cue',
          phase: 'update',
          run(ctx) {
            ctx.cue(
              { kind: 'cue', name: 'test.unregistered', schema: { x: t.i32 } },
              { x: 1 },
            )
          },
        }),
      ],
    })
    const cueWorld = new World({ features: [noCue] })
    expectRule(capture(() => cueWorld.step()), 'LG003')
  })

  it('fails the world when an invariant returns a message', () => {
    const Value = defineModel('Value', { value: t.i32 }, { value: 1 })
    const feature = defineFeature({
      name: 'invariant',
      schema: { models: [Value] },
      invariants: [
        defineInvariant('alwaysFails', (ctx) =>
          ctx.model(Value).value > 0 ? 'value must stay zero' : null,
        ),
      ],
    })
    const world = new World({ features: [feature] })
    expectRule(capture(() => world.step()), 'LG003')
    expect(world.failed).toBe(true)
  })

  it('exposes guard errors with rule ids', () => {
    expect(guardError('LG005', 'owner mismatch').rule).toBe('LG005')
  })
})
