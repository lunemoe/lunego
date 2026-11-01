import { describe, expect, it } from 'vitest'
import {
  World,
  defineCommand,
  defineFeature,
  defineHandler,
  defineSystem,
  ok,
  reject,
  t,
} from '../index.js'
import { Hit, Moved, Reward, Spend, Wallet } from './fixtures.js'

const economyFeature = defineFeature({
  name: 'economy',
  schema: {
    models: [Wallet],
    events: [Moved],
    cues: [Hit],
    commands: [Reward, Spend],
  },
  handlers: [
    defineHandler(Reward, {
      writes: [Wallet],
      emits: [Moved],
      cues: [Hit],
      run(ctx, payload) {
        ctx.mutModel(Wallet).gold += payload.amount
        ctx.emit(Moved, { entity: 0 })
        ctx.cue(Hit, { at: { x: 1, y: 2 }, power: 0.5 })
        return ok()
      },
    }),
    defineHandler(Spend, {
      writes: [Wallet],
      run(ctx, payload) {
        const wallet = ctx.mutModel(Wallet)
        if (wallet.gold < payload.amount) {
          return reject('insufficient_gold')
        }
        wallet.gold -= payload.amount
        return ok()
      },
    }),
  ],
})

describe('commands', () => {
  it('executes a command at the tick boundary and resolves its promise', async () => {
    const world = new World({ features: [economyFeature] })
    const pending = world.send(Reward, { amount: 5 }, { source: 7 })
    expect(world.model(Wallet).gold).toBe(10)
    const frame = world.step()
    await expect(pending).resolves.toEqual({ status: 'ok' })
    expect(world.model(Wallet).gold).toBe(15)
    expect(frame.events).toEqual([{ type: 'test.moved', tick: 1, payload: { entity: 0 } }])
    expect(frame.cues).toEqual([
      {
        id: '1:test.reward:0',
        type: 'test.hit',
        tick: 1,
        sequence: 0,
        source: 'test.reward',
        payload: { at: { x: 1, y: 2 }, power: 0.5 },
      },
    ])
    expect(frame.modelPatches).toEqual([{ model: 'Wallet', path: ['gold'], value: 15 }])
    expect(world.commandLog).toEqual([
      {
        tick: 1,
        seq: 0,
        source: 7,
        type: 'test.reward',
        payload: { amount: 5 },
      },
    ])
  })

  it('returns rejected results without applying the handler write', async () => {
    const world = new World({ features: [economyFeature] })
    const pending = world.send(Spend, { amount: 99 })
    const frame = world.step()
    await expect(pending).resolves.toEqual({
      status: 'rejected',
      reason: 'insufficient_gold',
    })
    expect(world.model(Wallet).gold).toBe(10)
    expect(frame.modelPatches).toEqual([])
  })

  it('keeps command execution ordered by sequence', async () => {
    const world = new World({ features: [economyFeature] })
    const first = world.send(Reward, { amount: 1 })
    const second = world.send(Reward, { amount: 2 })
    world.step()
    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: 'ok' },
      { status: 'ok' },
    ])
    expect(world.model(Wallet).gold).toBe(13)
    expect(world.commandLog.map((entry) => entry.seq)).toEqual([0, 1])
  })

  it('honours an explicit target tick', async () => {
    const world = new World({ features: [economyFeature] })
    const pending = world.send(Reward, { amount: 4 }, { tick: 3 })
    world.step()
    expect(world.model(Wallet).gold).toBe(10)
    world.step()
    expect(world.model(Wallet).gold).toBe(10)
    world.step()
    await expect(pending).resolves.toEqual({ status: 'ok' })
    expect(world.model(Wallet).gold).toBe(14)
  })

  it('validates payloads at the boundary', () => {
    const world = new World({ features: [economyFeature] })
    expect(() => world.send(Reward, { amount: 1.5 })).toThrow(/i32/)
    expect(() => world.send(Reward, { amount: 1 }, { source: -1 })).toThrow(/source/)
    expect(() => world.send('test.unknown', {})).toThrow(/not registered/)
  })

  it('rejects commands sent while the world is stepping', () => {
    const probe = defineCommand('test.probe', { value: t.i32 })
    let worldReference: World | null = null
    const trigger = defineSystem({
      name: 'intrusive.send',
      phase: 'update',
      run() {
        worldReference?.send(probe, { value: 1 })
      },
    })
    const feature = defineFeature({
      name: 'nested',
      schema: { commands: [probe] },
      systems: [trigger],
      handlers: [
        defineHandler(probe, {
          run() {
            return ok()
          },
        }),
      ],
    })
    const world = new World({ features: [feature] })
    worldReference = world
    expect(() => world.step()).toThrow(/inside a tick/)
    expect(world.failed).toBe(true)
  })
})
