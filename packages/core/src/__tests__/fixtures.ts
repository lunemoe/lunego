import {
  defineCommand,
  defineComponent,
  defineCue,
  defineEvent,
  defineFeature,
  defineModel,
  defineSystem,
  defineTag,
  t,
  without,
  type FeatureDef,
  type SystemDef,
} from '../index.js'

export const Position = defineComponent(
  'Position',
  { x: t.f32, y: t.f32 },
  { persist: 'world' },
)

export const Velocity = defineComponent(
  'Velocity',
  { x: t.f32, y: t.f32 },
  { persist: 'world' },
)

export const Frozen = defineTag('Frozen', { persist: 'world' })

export const Wallet = defineModel(
  'Wallet',
  { gold: t.i32 },
  { gold: 10 },
  { persist: 'world' },
)

export const Log = defineModel(
  'Log',
  { entries: t.array(t.str) },
  { entries: [] },
  { persist: 'world' },
)

export const Enabled = defineModel(
  'Enabled',
  { value: t.bool },
  { value: true },
  { persist: 'world' },
)

export const Beat = defineEvent('test.beat', { tick: t.i32 })
export const Moved = defineEvent('test.moved', { entity: t.entity })
export const Hit = defineCue('test.hit', { at: t.vec2, power: t.f32 })

export const Nudge = defineCommand('test.nudge', { dx: t.f32, dy: t.f32 })
export const Reward = defineCommand('test.reward', { amount: t.i32 })
export const Spend = defineCommand('test.spend', { amount: t.i32 })

export function motionFeature(extraSystems: readonly SystemDef[] = []): FeatureDef {
  const integrate = defineSystem({
    name: 'motion.integrate',
    phase: 'update',
    reads: [Velocity],
    writes: [Position],
    run(ctx) {
      const position = ctx.write(Position)
      const velocity = ctx.read(Velocity)
      for (const entity of ctx.query(Position, Velocity, without(Frozen))) {
        position.x[entity] += velocity.x[entity] * ctx.time.dt
        position.y[entity] += velocity.y[entity] * ctx.time.dt
      }
    },
  })
  return defineFeature({
    name: 'motion',
    schema: {
      components: [Position, Velocity],
      tags: [Frozen],
      models: [Wallet, Log, Enabled],
      events: [Beat, Moved],
      cues: [Hit],
    },
    systems: [integrate, ...extraSystems],
  })
}
