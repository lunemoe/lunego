import { describe, expect, it } from 'vitest'
import {
  defineCommand,
  defineComponent,
  defineFeature,
  defineHandler,
  defineModel,
  defineSystem,
  ok,
  t,
  type FeatureDef,
} from '@lunego/core'
import { createGame, type GameOptions } from '../index.js'

const Position = defineComponent(
  'HostPosition',
  { x: t.f32, y: t.f32 },
  { persist: 'world', interpolate: true },
)
const Velocity = defineComponent(
  'HostVelocity',
  { x: t.f32, y: t.f32 },
  { persist: 'world' },
)
const Counter = defineModel(
  'HostCounter',
  { value: t.i32 },
  { value: 0 },
  { persist: 'world' },
)
const SetVelocity = defineCommand('host.setVelocity', { x: t.f32, y: t.f32 })
const Start = defineCommand('host.start', {})

function createFeature(): FeatureDef {
  const integrate = defineSystem({
    name: 'host.integrate',
    phase: 'update',
    reads: [Velocity],
    writes: [Position, Counter],
    run(ctx) {
      const position = ctx.write(Position)
      const velocity = ctx.read(Velocity)
      for (const entity of ctx.query(Position, Velocity)) {
        position.x[entity] += velocity.x[entity] * ctx.time.dt
        position.y[entity] += velocity.y[entity] * ctx.time.dt
      }
      ctx.mutModel(Counter).value += 1
    },
  })
  const setVelocity = defineHandler(SetVelocity, {
    writes: [Velocity],
    run(ctx, payload) {
      const velocity = ctx.write(Velocity)
      for (const entity of ctx.query(Velocity)) {
        velocity.x[entity] = payload.x
        velocity.y[entity] = payload.y
      }
      return ok()
    },
  })
  const start = defineHandler(Start, {
    writes: [Position, Velocity],
    run(ctx) {
      ctx.spawn({
        HostPosition: { x: 0, y: 0 },
        HostVelocity: { x: 0, y: 0 },
      })
      return ok()
    },
  })
  return defineFeature({
    name: 'host-fixture',
    schema: {
      components: [Position, Velocity],
      models: [Counter],
      commands: [SetVelocity, Start],
    },
    systems: [integrate],
    handlers: [setVelocity, start],
  })
}

function makeGame(options: Partial<GameOptions> = {}): ReturnType<typeof createGame> {
  return createGame({
    features: [createFeature()],
    dt: 0.1,
    ...options,
  })
}

function spawnPlayer(game: ReturnType<typeof createGame>): number {
  void game.send(Start, {})
  game.step()
  const entity = game.view.entities(Position)[0]
  if (entity === undefined) {
    throw new Error('start command did not spawn a player')
  }
  return entity
}

describe('host game', () => {
  it('advances realtime at a fixed step and exposes frames', () => {
    const frames: number[] = []
    const game = makeGame({ onFrame: (frame) => frames.push(frame.tick) })
    expect(game.update(0.05)).toBe(0)
    expect(game.update(0.05)).toBe(1)
    expect(game.tick).toBe(1)
    expect(frames).toEqual([1])
    expect(game.frame.models['HostCounter']).toEqual({ value: 1 })
  })

  it('supports pause, resume and speed', () => {
    const game = makeGame({ dt: 0.1 })
    game.pause()
    expect(game.update(1)).toBe(0)
    expect(game.tick).toBe(0)
    game.resume()
    game.setSpeed(2)
    expect(game.update(0.05)).toBe(1)
    expect(game.tick).toBe(1)
  })

  it('runs onDemand only when commands are pending', () => {
    const game = makeGame({ timeMode: 'onDemand' })
    expect(game.update(1)).toBe(0)
    void game.send(SetVelocity, { x: 1, y: 0 })
    expect(game.update(1)).toBe(1)
    expect(game.tick).toBe(1)
    expect(game.update(1)).toBe(0)
  })

  it('runs fastForward without render frames', () => {
    const renders: boolean[] = []
    const game = makeGame({
      timeMode: 'fastForward',
      onFrame: (frame) => renders.push(frame.render),
    })
    expect(game.update(1)).toBe(10)
    expect(renders.every((render) => render === false)).toBe(true)
  })

  it('applies time gap decisions', () => {
    let decisions = 0
    const skipped = makeGame({
      maxCatchUp: 0.25,
      onTimeGap: () => {
        decisions += 1
        return 'skip'
      },
    })
    expect(skipped.update(1)).toBe(2)
    expect(decisions).toBe(1)

    const caughtUp = makeGame({ maxCatchUp: 0.25, onTimeGap: () => 'catchUp' })
    expect(caughtUp.update(1)).toBe(10)

    const paused = makeGame({ maxCatchUp: 0.25, onTimeGap: () => 'pause' })
    expect(paused.update(1)).toBe(0)
    expect(paused.paused).toBe(true)
  })

  it('is transparent across save and load', () => {
    const full = makeGame()
    spawnPlayer(full)
    const fullHashes: string[] = []
    for (let tick = 1; tick <= 8; tick += 1) {
      if (tick === 2) {
        void full.send(SetVelocity, { x: 2, y: 1 })
      }
      full.update(0.1)
      fullHashes.push(full.frame.hash)
    }

    const split = makeGame()
    spawnPlayer(split)
    const before: string[] = []
    for (let tick = 1; tick <= 4; tick += 1) {
      if (tick === 2) {
        void split.send(SetVelocity, { x: 2, y: 1 })
      }
      split.update(0.1)
      before.push(split.frame.hash)
    }
    const save = JSON.parse(JSON.stringify(split.save())) as ReturnType<typeof split.save>
    const restored = makeGame()
    restored.load(save)
    expect(restored.frame.hash).toBe(split.frame.hash)
    const after: string[] = []
    for (let tick = 5; tick <= 8; tick += 1) {
      restored.update(0.1)
      after.push(restored.frame.hash)
    }
    expect(before).toEqual(fullHashes.slice(0, 4))
    expect(after).toEqual(fullHashes.slice(4))
  })

  it('replays a session and locates a corrupted tick with binary search', () => {
    const game = makeGame()
    spawnPlayer(game)
    for (let tick = 1; tick <= 5; tick += 1) {
      if (tick === 1) {
        void game.send(SetVelocity, { x: 1, y: 2 })
      }
      game.update(0.1)
    }
    const log = game.exportReplay()
    expect(game.replay(log)).toEqual({
      ok: true,
      endTick: 6,
      firstDivergenceTick: null,
      checkpointMismatch: false,
    })

    const tampered = {
      ...log,
      hashes: log.hashes.map((entry) =>
        entry.tick === 3 ? { tick: entry.tick, hash: 'deadbeefdeadbeef' } : entry,
      ),
    }
    const report = game.replay(tampered)
    expect(report.ok).toBe(false)
    expect(report.firstDivergenceTick).toBe(3)

    const badCheckpoint = {
      ...log,
      checkpoints: [{ tick: 0, hash: '0000000000000000' }],
    }
    expect(game.replay(badCheckpoint).checkpointMismatch).toBe(true)
  })

  it('stops on a logic error and exports a crash report', () => {
    const Broken = defineFeature({
      name: 'host-broken',
      systems: [
        defineSystem({
          name: 'host.broken',
          phase: 'update',
          run() {
            throw new Error('boom')
          },
        }),
      ],
    })
    let reported = false
    const game = createGame({
      features: [Broken],
      dt: 0.1,
      onError: () => {
        reported = true
      },
    })
    expect(game.update(0.1)).toBe(0)
    expect(game.crashReport?.message).toBe('boom')
    expect(game.crashReport?.snapshot.tick).toBe(1)
    expect(game.crashReport?.commandLog).toEqual([])
    expect(reported).toBe(true)
    expect(game.update(1)).toBe(0)
    expect(() => game.step()).toThrow(/boom|stopped/)
  })

  it('rejects worker mode explicitly and provides an interpolating view', () => {
    expect(() => makeGame({ mode: 'worker' })).toThrow(/worker mode/)
    const game = makeGame()
    const entity = spawnPlayer(game)
    game.update(0.1)
    void game.send(SetVelocity, { x: 2, y: 0 })
    game.update(0.1)
    expect(game.view.prev(entity, Position)).toEqual({ x: 0, y: 0 })
    expect(game.view.get(entity, Position)?.x).toBeCloseTo(0.2, 5)
    expect(game.view.has(entity, Position)).toBe(true)
  })
})
