import { describe, expect, it } from 'vitest'
import {
  World,
  added,
  defineFeature,
  defineSystem,
  defineTag,
  entityIndex,
  removed,
  without,
} from '../index.js'
import { Frozen, Position, Velocity, motionFeature } from './fixtures.js'

describe('ECS', () => {
  it('writes columns through packed entity ids and advances via dt', () => {
    const world = new World({ features: [motionFeature()], seed: 1 })
    const entity = world.spawn({
      Position: { x: 0, y: 0 },
      Velocity: { x: 6, y: -3 },
    })
    world.step()
    const position = world.get(entity, Position)
    expect(position?.x).toBe(Math.fround(6 * (1 / 60)))
    expect(position?.y).toBe(Math.fround(-3 * (1 / 60)))
  })

  it('filters with, without and tags', () => {
    const world = new World({ features: [motionFeature()], seed: 1 })
    const moving = world.spawn({
      Position: { x: 0, y: 0 },
      Velocity: { x: 1, y: 0 },
    })
    const frozen = world.spawn({
      Position: { x: 5, y: 5 },
      Velocity: { x: 1, y: 0 },
      Frozen: true,
    })
    expect(world.query(Position)).toEqual([moving, frozen])
    expect(world.query(Position, without(Frozen))).toEqual([moving])
    expect(world.hasComponent(frozen, Frozen)).toBe(true)
    world.step()
    expect(world.get(frozen, Position)?.x).toBe(5)
    expect(world.get(moving, Position)?.x).toBe(Math.fround(1 / 60))
  })

  it('buffers spawns until the flush at the end of the tick', () => {
    let seenDuringRun = -1
    const spawner = defineSystem({
      name: 'test.spawner',
      phase: 'update',
      writes: [Position],
      run(ctx) {
        ctx.spawn({ Position: { x: 1, y: 2 } })
        seenDuringRun = ctx.query(Position).length
      },
    })
    const feature = defineFeature({
      name: 'spawner',
      schema: { components: [Position] },
      systems: [spawner],
    })
    const world = new World({ features: [feature] })
    world.step()
    expect(seenDuringRun).toBe(0)
    expect(world.query(Position)).toHaveLength(1)
  })

  it('reports added and removed components from the last flush', () => {
    const feature = defineFeature({
      name: 'changes',
      schema: { components: [Position] },
    })
    const world = new World({ features: [feature] })
    const entity = world.spawn({ Position: { x: 1, y: 1 } })
    expect(world.query(added(Position))).toEqual([entity])
    world.step()
    expect(world.query(added(Position))).toEqual([])
    world.remove(entity, Position)
    expect(world.query(removed(Position))).toEqual([entity])
    expect(world.hasComponent(entity, Position)).toBe(false)
  })

  it('reuses indices with an incremented generation', () => {
    const feature = defineFeature({
      name: 'reuse',
      schema: { components: [Position] },
    })
    const world = new World({ features: [feature] })
    const first = world.spawn({ Position: { x: 0, y: 0 } })
    world.despawn(first)
    const second = world.spawn({ Position: { x: 2, y: 3 } })
    expect(entityIndex(second)).toBe(entityIndex(first))
    expect(second).not.toBe(first)
    expect(world.hasComponent(first, Position)).toBe(false)
    expect(world.get(second, Position)).toEqual({ x: 2, y: 3 })
  })

  it('returns entities in ascending index order including reused slots', () => {
    const feature = defineFeature({
      name: 'order',
      schema: { components: [Position, Velocity], tags: [Frozen] },
    })
    const world = new World({ features: [feature] })
    const first = world.spawn({ Position: { x: 0, y: 0 } })
    const second = world.spawn({ Position: { x: 0, y: 0 } })
    const third = world.spawn({ Position: { x: 0, y: 0 } })
    world.despawn(second)
    const replacement = world.spawn({ Position: { x: 0, y: 0 } })
    const result = world.query(Position)
    expect(result).toHaveLength(3)
    expect(result.map(entityIndex)).toEqual([
      entityIndex(first),
      entityIndex(replacement),
      entityIndex(third),
    ])
  })

  it('supports adding and removing tags inside systems with buffered state', () => {
    const marker = defineTag('test.marker')
    const feature = defineFeature({
      name: 'tag-ops',
      schema: { components: [Position], tags: [marker] },
      systems: [
        defineSystem({
          name: 'test.tagOps',
          phase: 'update',
          writes: [marker],
          run(ctx) {
            for (const entity of ctx.query(Position)) {
              if (ctx.has(entity, marker)) {
                ctx.remove(entity, marker)
              } else {
                ctx.add(entity, marker)
              }
            }
          },
        }),
      ],
    })
    const world = new World({ features: [feature] })
    const entity = world.spawn({ Position: { x: 0, y: 0 } })
    world.step()
    expect(world.hasComponent(entity, marker)).toBe(true)
    world.step()
    expect(world.hasComponent(entity, marker)).toBe(false)
  })
})
