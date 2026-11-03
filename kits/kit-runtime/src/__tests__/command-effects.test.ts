import { expect, it } from 'vitest'
import { ActorPosition, MoveIntent, InventoryState, EquipmentState, EquipItem, PickupItem } from '../index.js'
import { makeWorld } from './fixtures.js'

it('moves through the registered command and stops on release', async () => {
  const { world, player } = makeWorld()
  const before = world.get(player, ActorPosition)!
  const moving = world.send(MoveIntent, { x: 1, y: 0 })
  world.step(10)
  expect(await moving).toEqual({ status: 'ok' })
  expect(world.get(player, ActorPosition)!.x).toBeGreaterThan(before.x)
  const stopped = world.send(MoveIntent, { x: 0, y: 0 })
  world.step()
  expect(await stopped).toEqual({ status: 'ok' })
  const position = world.get(player, ActorPosition)!
  world.step(10)
  expect(world.get(player, ActorPosition)).toEqual(position)
})

it('returns the previous equipped item to inventory without losing its identity', async () => {
  const { world, player } = makeWorld()
  world.remove(player, InventoryState)
  world.add(player, InventoryState, { snapshot: JSON.stringify({ slots: [{ id: 'new', contentId: 'fixture.sword', quantity: 1, affixes: [] }] }) })
  world.remove(player, EquipmentState)
  world.add(player, EquipmentState, { snapshot: JSON.stringify({ slots: { weapon: { id: 'previous', contentId: 'fixture.sword', quantity: 1, affixes: [] } } }) })
  const command = world.send(EquipItem, { slot: 0 })
  world.step()
  expect(await command).toEqual({ status: 'ok' })
  const inventory: unknown = JSON.parse(world.get(player, InventoryState)!.snapshot)
  const equipment: unknown = JSON.parse(world.get(player, EquipmentState)!.snapshot)
  expect(inventory).toMatchObject({ slots: [{ id: 'previous' }] })
  expect(equipment).toMatchObject({ slots: { weapon: { id: 'new' } } })
})

it('rejects a repeated pickup without crashing the tick or duplicating inventory', async () => {
  const { world, player } = makeWorld()
  const ground = world.spawn({
    'runtime.actor.position': { x: 0, y: 0 },
    'runtime.items.ground': { item: JSON.stringify({ id: 'once', contentId: 'fixture.sword', quantity: 1, affixes: [] }) },
  })
  const first = world.send(PickupItem, { ground })
  const second = world.send(PickupItem, { ground })
  expect(() => world.step()).not.toThrow()
  expect(await first).toEqual({ status: 'ok' })
  expect(await second).toEqual({ status: 'rejected', reason: 'missing_ground' })
  const inventory: unknown = JSON.parse(world.get(player, InventoryState)!.snapshot)
  expect(inventory).toMatchObject({ slots: [{ id: 'once' }, null, null, null, null, null, null, null, null, null] })
})
