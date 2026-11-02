import { describe, expect, it } from 'vitest'
import {
  World,
  defineCommand,
  defineComponent,
  defineFeature,
  defineHandler,
  definePrefab,
  defineTag,
  ok,
  t,
} from '../index.js'

const Position = defineComponent('PrefabPosition', { x: t.f32, y: t.f32 }, { persist: 'world' })
const Health = defineComponent('PrefabHealth', { hp: t.i32 }, { persist: 'world' })
const Marker = defineTag('PrefabMarker')

const Spawn = defineCommand('prefab.spawn', {})
const prefab = definePrefab('actor', {
  PrefabPosition: { x: 2, y: 3 },
  PrefabHealth: { hp: 10 },
  PrefabMarker: true,
})
const handler = defineHandler(Spawn, {
  writes: [Position, Health, Marker],
  run(ctx) {
    ctx.spawn(prefab, { PrefabHealth: { hp: 30 } })
    return ok()
  },
})
const feature = defineFeature({
  name: 'prefab-fixture',
  schema: { components: [Position, Health], tags: [Marker], commands: [Spawn] },
  handlers: [handler],
})

describe('prefabs', () => {
  it('spawns the same hash as an equivalent component record', () => {
    const prefab = definePrefab('actor', {
      PrefabPosition: { x: 2, y: 3 },
      PrefabHealth: { hp: 10 },
      PrefabMarker: true,
    })
    const a = new World({ features: [feature] })
    const b = new World({ features: [feature] })
    a.spawn(prefab)
    b.spawn({
      PrefabPosition: { x: 2, y: 3 },
      PrefabHealth: { hp: 10 },
      PrefabMarker: true,
    })
    expect(a.hash()).toBe(b.hash())
    expect(a.query(Position)).toHaveLength(1)
    expect(a.hasComponent(a.query(Position)[0] as number, Marker)).toBe(true)
  })

  it('spawns through ctx.spawn with the same semantics', async () => {
    const world = new World({ features: [feature] })
    void world.send(Spawn, {})
    world.step()
    const entity = world.query(Position)[0]
    expect(entity).toBeDefined()
    expect(world.get(entity as number, Health)).toEqual({ hp: 30 })
  })

  it('merges component-level overrides and validates them', () => {
    const prefab = definePrefab('actor', {
      PrefabPosition: { x: 0, y: 0 },
      PrefabHealth: { hp: 10 },
    })
    const world = new World({ features: [feature] })
    const entity = world.spawn(prefab, { PrefabPosition: { y: 5 }, PrefabHealth: { hp: 20 } })
    expect(world.get(entity, Position)).toEqual({ x: 0, y: 5 })
    expect(world.get(entity, Health)).toEqual({ hp: 20 })
    expect(() => world.spawn(prefab, { PrefabHealth: { hp: 'bad' } })).toThrow(/finite number/)
    expect(() => definePrefab('', { PrefabPosition: { x: 0, y: 0 } })).toThrow(/name/)
  })
})
