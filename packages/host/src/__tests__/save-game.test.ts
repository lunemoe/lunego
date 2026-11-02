import { describe, expect, it } from 'vitest'
import {
  ContentRegistry,
  defineCommand,
  defineComponent,
  defineContentType,
  defineFeature,
  defineHandler,
  defineModel,
  defineSystem,
  ok,
  t,
  type FeatureDef,
} from '@lunego/core'
import { createGame, type Game, type GameOptions, type GameSave } from '../index.js'

const Position = defineComponent(
  'SavePosition',
  { x: t.f32 },
  { persist: 'world', interpolate: true },
)
const ProfileStat = defineComponent(
  'SaveProfileStat',
  { xp: t.i32 },
  { persist: 'profile' },
)
const Progress = defineModel(
  'SaveProgress',
  { level: t.i32, xp: t.i32 },
  { level: 0, xp: 0 },
  { persist: 'profile' },
)
const Wallet = defineModel(
  'SaveWallet',
  { gold: t.i32 },
  { gold: 0 },
  { persist: 'world' },
)
const Start = defineCommand('save.start', {})
const AddXp = defineCommand('save.addXp', { amount: t.i32 })

function createFeature(): FeatureDef {
  const advance = defineSystem({
    name: 'save.advance',
    phase: 'update',
    reads: [],
    writes: [Position, ProfileStat, Progress, Wallet],
    run(ctx) {
      const position = ctx.write(Position)
      for (const entity of ctx.query(Position)) {
        position.x[entity] += 1
      }
      const stat = ctx.write(ProfileStat)
      for (const entity of ctx.query(ProfileStat)) {
        stat.xp[entity] += 3
      }
      const progress = ctx.mutModel(Progress)
      progress.xp += 1
      if (progress.xp >= 4) {
        progress.level += 1
        progress.xp = 0
      }
      ctx.mutModel(Wallet).gold += 2
    },
  })
  const start = defineHandler(Start, {
    writes: [Position, ProfileStat],
    run(ctx) {
      ctx.spawn({
        SavePosition: { x: 0 },
        SaveProfileStat: { xp: 0 },
      })
      return ok()
    },
  })
  const addXp = defineHandler(AddXp, {
    writes: [ProfileStat],
    run(ctx, payload) {
      const stat = ctx.write(ProfileStat)
      for (const entity of ctx.query(ProfileStat)) {
        stat.xp[entity] += payload.amount
      }
      return ok()
    },
  })
  return defineFeature({
    name: 'save-fixture',
    schema: {
      components: [Position, ProfileStat],
      models: [Progress, Wallet],
      commands: [Start, AddXp],
    },
    systems: [advance],
    handlers: [start, addXp],
  })
}

function makeGame(options: Partial<GameOptions> = {}): Game {
  return createGame({
    features: [createFeature()],
    dt: 0.1,
    ...options,
  })
}

function start(game: Game): number {
  void game.send(Start, {})
  game.step()
  const entity = game.view.entities(Position)[0]
  if (entity === undefined) {
    throw new Error('start command did not spawn a player')
  }
  return entity
}

describe('paired world/profile saves', () => {
  it('snapshots world and profile scopes at the same tick', () => {
    const game = makeGame()
    start(game)
    game.step(3)
    const save = game.saveGame()

    expect(save.world.scope).toBe('world')
    expect(save.profile.scope).toBe('profile')
    expect(save.world.tick).toBe(save.profile.tick)
    expect(save.world.contentHash).toBe(save.profile.contentHash)
    expect(save.world.schemaVersion).toBe(save.profile.schemaVersion)
    expect(save.world.components['SaveProfileStat']).toBeUndefined()
    expect(save.world.models['SaveProgress']).toBeUndefined()
    expect(save.profile.components['SavePosition']).toBeUndefined()
    expect(save.profile.models['SaveWallet']).toBeUndefined()
    expect(save.profile.components['SaveProfileStat']).toBeDefined()
    expect(save.profile.models['SaveProgress']).toBeDefined()
  })

  it('loads N/2 world+profile ticks transparently', () => {
    const full = makeGame()
    const entity = start(full)
    const fullHashes: string[] = []
    for (let index = 0; index < 8; index += 1) {
      full.step()
      fullHashes.push(full.frame.hash)
    }

    const split = makeGame()
    const splitEntity = start(split)
    expect(splitEntity).toBe(entity)
    for (let index = 0; index < 3; index += 1) {
      split.step()
    }
    expect(split.frame.hash).toBe(fullHashes[2])

    const save = JSON.parse(JSON.stringify(split.saveGame())) as GameSave
    const restored = makeGame()
    restored.loadGame(save)
    expect(restored.tick).toBe(4)
    expect(restored.frame.models['SaveProgress']).toEqual(
      split.frame.models['SaveProgress'],
    )
    expect(restored.view.get(splitEntity, ProfileStat)).toEqual(
      split.view.get(splitEntity, ProfileStat),
    )

    const after: string[] = []
    for (let index = 0; index < 5; index += 1) {
      restored.step()
      after.push(restored.frame.hash)
    }
    expect(after).toEqual(fullHashes.slice(3))
    expect(restored.exportReplay().snapshot.scope).toBe('combined')
    expect(restored.replay(restored.exportReplay()).ok).toBe(true)
  })

  it('rejects saves whose scopes, tick or schema do not match', () => {
    const source = makeGame()
    start(source)
    source.step(2)
    const save = source.saveGame()

    const target = makeGame()
    const entity = start(target)
    target.step(3)
    const beforeHash = target.frame.hash
    const beforeTick = target.tick
    const beforeCount = target.view.entities(Position).length

    const wrongTick = {
      ...save,
      profile: { ...save.profile, tick: save.profile.tick + 1 },
    }
    expect(() => target.loadGame(wrongTick)).toThrow(
      expect.objectContaining({ code: 'load_failed' }),
    )
    expect(target.frame.hash).toBe(beforeHash)
    expect(target.tick).toBe(beforeTick)
    expect(target.view.entities(Position)).toHaveLength(beforeCount)

    expect(() =>
      target.loadGame({ world: save.profile, profile: save.world }),
    ).toThrow(expect.objectContaining({ code: 'load_failed' }))
    expect(target.frame.hash).toBe(beforeHash)

    const wrongSchema = {
      ...save,
      world: { ...save.world, schemaVersion: save.world.schemaVersion + 1 },
    }
    expect(() => target.loadGame(wrongSchema)).toThrow(
      expect.objectContaining({ code: 'load_failed' }),
    )
    const entityPosition = target.view.get(entity, Position)?.x
    expect(entityPosition).toBeDefined()
    expect(target.view.get(entity, Position)?.x).toBe(entityPosition)
    expect(target.frame.hash).toBe(beforeHash)
  })

  it('rejects a save from different content and keeps the old world', () => {
    const Item = defineContentType('SaveItem', { value: t.i32 })
    const content = new ContentRegistry()
    content.add(Item, 'sword', { value: 1 })
    const source = makeGame({ content })
    start(source)
    source.step(2)
    const save = source.saveGame()

    const otherContent = new ContentRegistry()
    otherContent.add(Item, 'sword', { value: 2 })
    const target = makeGame({ content: otherContent })
    start(target)
    const beforeHash = target.frame.hash
    const beforeTick = target.tick

    expect(() => target.loadGame(save)).toThrow(
      expect.objectContaining({ code: 'load_failed' }),
    )
    expect(target.frame.hash).toBe(beforeHash)
    expect(target.tick).toBe(beforeTick)
  })

  it('rebuilds the view source and rejects pending commands on load', async () => {
    const source = makeGame()
    start(source)
    void source.send(AddXp, { amount: 5 })
    source.step()
    source.step()
    const save = JSON.parse(JSON.stringify(source.saveGame())) as GameSave

    const target = makeGame()
    const stale = start(target)
    target.step()
    const pending = target.send(AddXp, { amount: 1 }, { tick: 50 })
    const rejected = pending.catch((error: unknown) => error)
    target.loadGame(save)
    const error = await rejected
    expect((error as { code?: string }).code).toBe('game_loaded')
    expect(target.view.entities(Position)).toHaveLength(1)
    expect(target.view.get(stale, ProfileStat)).toEqual(
      source.view.get(stale, ProfileStat),
    )
    expect(target.view.get(stale, Position)).toEqual(source.view.get(stale, Position))
  })

  it('keeps pending commands when a paired load fails', () => {
    const game = makeGame()
    start(game)
    const pending = game.send(AddXp, { amount: 1 }, { tick: 50 })
    void pending.catch(() => undefined)
    const save = game.saveGame()
    const bad = {
      ...save,
      profile: { ...save.profile, contentHash: 'different' },
    }
    expect(() => game.loadGame(bad)).toThrow(
      expect.objectContaining({ code: 'load_failed' }),
    )
    expect(game.pendingCommandCount).toBe(1)
  })
})
