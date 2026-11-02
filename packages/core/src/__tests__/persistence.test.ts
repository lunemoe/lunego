import { describe, expect, it } from 'vitest'
import {
  ContentRegistry,
  LuneGoError,
  World,
  defineCommand,
  defineComponent,
  defineContentType,
  defineFeature,
  defineHandler,
  defineModel,
  defineState,
  ok,
  t,
} from '../index.js'
import type { WorldSnapshot } from '../index.js'

const Position = defineComponent('PersistPosition', { x: t.f32 }, { persist: 'world' })
const ProfileTag = defineComponent('PersistProfile', { level: t.i32 }, { persist: 'profile' })
const Scratch = defineComponent('PersistScratch', { n: t.i32 })
const Wallet = defineModel('PersistWallet', { gold: t.i32 }, { gold: 0 }, { persist: 'world' })
const Hit = defineCommand('persist.hit', { amount: t.i32 })

const handler = defineHandler(Hit, {
  writes: [Wallet],
  run(ctx, payload) {
    ctx.mutModel(Wallet).gold += payload.amount
    return ok()
  },
})

const feature = defineFeature({
  name: 'persistence',
  schema: {
    components: [Position, ProfileTag, Scratch],
    models: [Wallet],
    commands: [Hit],
  },
  handlers: [handler],
})

function roundTrip(snapshot: WorldSnapshot): WorldSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as WorldSnapshot
}

function makeWorld(dt = 1 / 60): World {
  return new World({ features: [feature], dt })
}

describe('snapshot transparency', () => {
  it('records dt, content hash and pending commands', () => {
    const world = makeWorld(1 / 30)
    const entity = world.spawn({ PersistPosition: { x: 1 } })
    void world.send(Hit, { amount: 2 }, { tick: 4 })
    world.step()
    const snapshot = world.snapshot()
    expect(snapshot.dt).toBe(1 / 30)
    expect(snapshot.contentHash).toMatch(/^[0-9a-f]{16}$/)
    expect(snapshot.pendingCommands).toHaveLength(1)
    expect(snapshot.pendingCommands[0]?.tick).toBe(4)
    expect(snapshot.components.PersistPosition?.entries[0]?.entity).toBe(entity)
  })

  it('restores dt from the snapshot unless the caller disagrees', () => {
    const world = makeWorld(1 / 30)
    world.spawn({ PersistPosition: { x: 0 } })
    world.step()
    const snapshot = roundTrip(world.snapshot())
    const restored = World.fromSnapshot(snapshot, {
      features: [feature],
      schemaVersion: 1,
    })
    expect(restored.dt).toBe(1 / 30)
    expect(() =>
      World.fromSnapshot(snapshot, {
        features: [feature],
        schemaVersion: 1,
        dt: 1 / 60,
      }),
    ).toThrow(/dt/)
  })

  it('rejects a snapshot taken from different content', () => {
    const Thing = defineContentType('persistThing', { value: t.i32 })
    const content = new ContentRegistry()
    content.add(Thing, 'a', { value: 1 })
    const world = new World({ features: [feature], content })
    world.step()
    const snapshot = roundTrip(world.snapshot())
    expect(() =>
      World.fromSnapshot(snapshot, { features: [feature], schemaVersion: 1 }),
    ).toThrow(/content hash/)
    const same = new ContentRegistry()
    same.add(Thing, 'a', { value: 1 })
    expect(
      World.fromSnapshot(snapshot, {
        features: [feature],
        schemaVersion: 1,
        content: same,
      }).hash(),
    ).toBe(world.hash())
    const different = new ContentRegistry()
    different.add(Thing, 'a', { value: 2 })
    expect(() =>
      World.fromSnapshot(snapshot, {
        features: [feature],
        schemaVersion: 1,
        content: different,
      }),
    ).toThrow(/content hash/)
  })

  it('rejects a snapshot from a different asset pack/version', () => {
    const content = new ContentRegistry()
    content.setAssetPack({ pack: 'demo', version: '1', hash: 'aaa' })
    const world = new World({ features: [feature], content })
    world.step()
    const snapshot = roundTrip(world.snapshot())
    const other = new ContentRegistry()
    other.setAssetPack({ pack: 'demo', version: '2', hash: 'aaa' })
    expect(() =>
      World.fromSnapshot(snapshot, { features: [feature], schemaVersion: 1, content: other }),
    ).toThrow(/content hash/)
  })

  it('keeps pending future commands across save and load', () => {
    const full = makeWorld()
    void full.send(Hit, { amount: 3 }, { tick: 6 })
    for (let index = 0; index < 8; index += 1) {
      full.step()
    }

    const split = makeWorld()
    void split.send(Hit, { amount: 3 }, { tick: 6 })
    for (let index = 0; index < 4; index += 1) {
      split.step()
    }
    const restored = World.fromSnapshot(roundTrip(split.snapshot()), {
      features: [feature],
      schemaVersion: 1,
    })
    for (let index = 0; index < 4; index += 1) {
      restored.step()
    }
    expect(restored.model(Wallet).gold).toBe(full.model(Wallet).gold)
    expect(restored.hash()).toBe(full.hash())
    expect(restored.pendingCommandCount).toBe(0)
  })

  it('loads world and profile snapshots through one explicit call', () => {
    const world = makeWorld()
    const entity = world.spawn({
      PersistPosition: { x: 4 },
      PersistProfile: { level: 7 },
    })
    world.step()
    const worldSnapshot = roundTrip(world.snapshot('world'))
    const profileSnapshot = roundTrip(world.snapshot('profile'))
    const restored = World.fromSnapshots(
      { world: worldSnapshot, profile: profileSnapshot },
      { features: [feature], schemaVersion: 1 },
    )
    expect(restored.get(entity, Position)).toEqual({ x: 4 })
    expect(restored.get(entity, ProfileTag)).toEqual({ level: 7 })
    expect(restored.hasComponent(entity, Scratch)).toBe(false)
    expect(restored.hash()).toBe(world.hash())
  })

  it('warns once when an ephemeral state is snapshotted in dev', () => {
    const world = makeWorld()
    world.spawn({ PersistScratch: { n: 1 } })
    world.snapshot()
    world.snapshot()
    expect(
      world.diagnostics.filter((entry) => entry.code === 'snapshot-ephemeral'),
    ).toHaveLength(1)
  })

  it('rejects snapshots that are inconsistent with the schema', () => {
    const world = makeWorld()
    world.step()
    const snapshot = roundTrip(world.snapshot())
    const broken = { ...snapshot, formatVersion: 1 }
    try {
      World.fromSnapshot(broken, { features: [feature], schemaVersion: 1 })
      throw new Error('expected format rejection')
    } catch (error) {
      expect(error).toBeInstanceOf(LuneGoError)
      if (error instanceof LuneGoError) {
        expect(error.rule).toBe('LG010')
      }
    }
  })
})

describe('flow state persistence', () => {
  it('hashes flow states and restores them from snapshots', () => {
    const Mode = defineState('PersistMode', ['idle', 'active'], { initial: 'idle' })
    const SetMode = defineCommand('persist.setMode', {})
    const handler = defineHandler(SetMode, {
      writes: [Mode],
      run(ctx) {
        ctx.setState(Mode, 'active')
        return ok()
      },
    })
    const feature = defineFeature({
      name: 'persist-flow',
      schema: { states: [Mode], commands: [SetMode] },
      handlers: [handler],
    })
    const idle = new World({ features: [feature] })
    const active = new World({ features: [feature] })
    void active.send(SetMode, {})
    active.step()
    expect(active.hash()).not.toBe(idle.hash())
    const restored = World.fromSnapshot(roundTrip(active.snapshot()), {
      features: [feature],
      schemaVersion: 1,
    })
    expect(restored.hash()).toBe(active.hash())
    active.step()
    restored.step()
    expect(restored.hash()).toBe(active.hash())
  })
})
