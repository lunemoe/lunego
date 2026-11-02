import { describe, expect, it } from 'vitest'
import {
  World,
  defineEvent,
  defineFeature,
  defineModel,
  defineSystem,
  t,
  type Diagnostic,
  type SystemDef,
} from '../index.js'
import { Position } from './fixtures.js'

function logModel(name: string) {
  return defineModel(name, { entries: t.array(t.str) }, { entries: [] })
}

describe('scheduler', () => {
  it('orders same-tick event emitters before listeners', () => {
    const Beat = defineEvent('sched.beat', { n: t.i32 })
    const Log = logModel('SchedLog')
    const listener = defineSystem({
      name: 'a.listen',
      phase: 'update',
      writes: [Log],
      listens: [Beat],
      run(ctx) {
        for (const payload of ctx.events(Beat)) {
          ctx.mutModel(Log).entries.push(`beat-${payload.n}`)
        }
      },
    })
    const emitter = defineSystem({
      name: 'z.emit',
      phase: 'update',
      emits: [Beat],
      run(ctx) {
        ctx.emit(Beat, { n: ctx.tick })
      },
    })
    const feature = defineFeature({
      name: 'events',
      schema: { models: [Log], events: [Beat] },
      systems: [listener, emitter],
    })
    const world = new World({ features: [feature] })
    world.step()
    expect(world.model(Log)).toEqual({ entries: ['beat-1'] })
  })

  it('honours explicit after constraints over name order', () => {
    const Log = logModel('AfterLog')
    const first = defineSystem({
      name: 'z.first',
      phase: 'update',
      writes: [Log],
      run(ctx) {
        ctx.mutModel(Log).entries.push('first')
      },
    })
    const second = defineSystem({
      name: 'a.second',
      phase: 'update',
      writes: [Log],
      after: [first],
      run(ctx) {
        ctx.mutModel(Log).entries.push('second')
      },
    })
    const feature = defineFeature({
      name: 'after',
      schema: { models: [Log] },
      systems: [second, first],
    })
    const world = new World({ features: [feature] })
    world.step()
    expect(world.model(Log)).toEqual({ entries: ['first', 'second'] })
  })

  it('falls back to stable name order', () => {
    const Log = logModel('NameLog')
    const alpha = defineSystem({
      name: 'a.alpha',
      phase: 'update',
      writes: [Log],
      run(ctx) {
        ctx.mutModel(Log).entries.push('alpha')
      },
    })
    const beta = defineSystem({
      name: 'b.beta',
      phase: 'update',
      writes: [Log],
      run(ctx) {
        ctx.mutModel(Log).entries.push('beta')
      },
    })
    const feature = defineFeature({
      name: 'names',
      schema: { models: [Log] },
      systems: [beta, alpha],
    })
    const diagnostics: Diagnostic[] = []
    const world = new World({
      features: [feature],
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    })
    world.step()
    expect(world.model(Log)).toEqual({ entries: ['alpha', 'beta'] })
    expect(diagnostics.some((entry) => entry.code === 'schedule-conflict')).toBe(true)
  })

  it('reports read/write conflicts without an ordering constraint', () => {
    const writer = defineSystem({
      name: 'conflict.writer',
      phase: 'update',
      writes: [Position],
      run() {},
    })
    const reader = defineSystem({
      name: 'conflict.reader',
      phase: 'update',
      reads: [Position],
      run() {},
    })
    const feature = defineFeature({
      name: 'conflict',
      schema: { components: [Position] },
      systems: [reader, writer],
    })
    const diagnostics: Diagnostic[] = []
    new World({
      features: [feature],
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    })
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]?.rule).toBe('LG003')
    expect(diagnostics[0]?.message).toContain('Position')
  })

  it('rejects ordering cycles', () => {
    const a = defineSystem({
      name: 'cycle.a',
      phase: 'update',
      run() {},
    })
    const b = defineSystem({
      name: 'cycle.b',
      phase: 'update',
      run() {},
    })
    const afterA = a.after as SystemDef[]
    const afterB = b.after as SystemDef[]
    afterA.push(b)
    afterB.push(a)
    const feature = defineFeature({
      name: 'cycle',
      schema: {},
      systems: [a, b],
    })
    expect(() => new World({ features: [feature] })).toThrow(/ordering cycle/)
  })

  it('runs systems conditionally with runIf', () => {
    const Enabled = defineModel('RunIfEnabled', { value: t.bool }, { value: true })
    const Log = logModel('RunIfLog')
    const conditional = defineSystem({
      name: 'run.if',
      phase: 'update',
      reads: [Enabled],
      writes: [Log],
      runIf: (ctx) => ctx.model(Enabled).value,
      run(ctx) {
        ctx.mutModel(Log).entries.push('ran')
      },
    })
    const feature = defineFeature({
      name: 'run-if',
      schema: { models: [Enabled, Log] },
      systems: [conditional],
    })
    const onWorld = new World({ features: [feature] })
    onWorld.step()
    expect(onWorld.model(Log)).toEqual({ entries: ['ran'] })

    const OffEnabled = defineModel('RunIfEnabledOff', { value: t.bool }, { value: false })
    const OffLog = logModel('RunIfLogOff')
    const offConditional = defineSystem({
      name: 'run.if.off',
      phase: 'update',
      reads: [OffEnabled],
      writes: [OffLog],
      runIf: (ctx) => ctx.model(OffEnabled).value,
      run(ctx) {
        ctx.mutModel(OffLog).entries.push('ran')
      },
    })
    const offFeature = defineFeature({
      name: 'run-if-off',
      schema: { models: [OffEnabled, OffLog] },
      systems: [offConditional],
    })
    const offWorld = new World({ features: [offFeature] })
    offWorld.step()
    expect(offWorld.model(OffLog)).toEqual({ entries: [] })
  })

  it('reads previous-tick events when prev is declared', () => {
    const Beat = defineEvent('sched.prevBeat', { n: t.i32 })
    const Log = logModel('PrevLog')
    const emitter = defineSystem({
      name: 'prev.emit',
      phase: 'pre',
      emits: [Beat],
      run(ctx) {
        ctx.emit(Beat, { n: ctx.tick })
      },
    })
    const reader = defineSystem({
      name: 'prev.read',
      phase: 'update',
      writes: [Log],
      listens: [{ event: Beat, prev: true }],
      run(ctx) {
        for (const payload of ctx.prev(Beat)) {
          ctx.mutModel(Log).entries.push(`prev-${payload.n}`)
        }
      },
    })
    const feature = defineFeature({
      name: 'prev',
      schema: { models: [Log], events: [Beat] },
      systems: [emitter, reader],
    })
    const world = new World({ features: [feature] })
    world.step()
    expect(world.model(Log)).toEqual({ entries: [] })
    world.step()
    expect(world.model(Log)).toEqual({ entries: ['prev-1'] })
  })
})
