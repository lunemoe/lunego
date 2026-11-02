import { describe, expect, it } from 'vitest'
import {
  World,
  defineCommand,
  defineFeature,
  defineHandler,
  defineState,
  ok,
} from '../index.js'

describe('state transitions', () => {
  it('chains transitions requested by onEnter/onExit in the same tick', () => {
    const log: string[] = []
    const Mode = defineState('state.chain', ['idle', 'run', 'done'], {
      initial: 'idle',
      onExit: {
        idle: {
          run: (ctx) => {
            log.push('exit:idle')
            ctx.setState(Mode, 'run')
          },
        },
      },
      onEnter: {
        run: {
          run: (ctx) => {
            log.push('enter:run')
            ctx.setState(Mode, 'done')
          },
        },
        done: {
          run: () => {
            log.push('enter:done')
          },
        },
      },
    })
    const Start = defineCommand('state.chain.start', {})
    const handler = defineHandler(Start, {
      writes: [Mode],
      run(ctx) {
        ctx.setState(Mode, 'run')
        return ok()
      },
    })
    const world = new World({
      features: [
        defineFeature({
          name: 'chain',
          schema: { commands: [Start], states: [Mode] },
          handlers: [handler],
        }),
      ],
    })
    void world.send(Start, {})
    world.step()
    expect(log).toEqual(['exit:idle', 'enter:run', 'enter:done'])
    expect(world.snapshot().states[Mode.name]).toBe('done')
  })

  it('treats a self transition as a no-op and does not recurse', () => {
    let entered = 0
    const Mode = defineState('state.self', ['idle', 'run'], {
      initial: 'idle',
      onEnter: {
        run: {
          run: (ctx) => {
            entered += 1
            ctx.setState(Mode, 'run')
          },
        },
      },
    })
    const Start = defineCommand('state.self.start', {})
    const handler = defineHandler(Start, {
      writes: [Mode],
      run(ctx) {
        ctx.setState(Mode, 'run')
        return ok()
      },
    })
    const world = new World({
      features: [
        defineFeature({
          name: 'self',
          schema: { commands: [Start], states: [Mode] },
          handlers: [handler],
        }),
      ],
    })
    void world.send(Start, {})
    expect(() => world.step()).not.toThrow()
    expect(world.snapshot().states[Mode.name]).toBe('run')
    expect(entered).toBe(1)
  })

  it('rejects a transition cycle after 32 steps and leaves the world failed', () => {
    const Mode = defineState('state.loop', ['a', 'b'], {
      initial: 'a',
      onEnter: {
        a: {
          run: (ctx) => ctx.setState(Mode, 'b'),
        },
        b: {
          run: (ctx) => ctx.setState(Mode, 'a'),
        },
      },
    })
    const Start = defineCommand('state.loop.start', {})
    const handler = defineHandler(Start, {
      writes: [Mode],
      run(ctx) {
        ctx.setState(Mode, 'b')
        return ok()
      },
    })
    const world = new World({
      features: [
        defineFeature({
          name: 'loop',
          schema: { commands: [Start], states: [Mode] },
          handlers: [handler],
        }),
      ],
    })
    void world.send(Start, {})
    expect(() => world.step()).toThrow(/32 steps/)
    expect(world.failed).toBe(true)
  })
})
