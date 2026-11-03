import { expect, it } from 'vitest'
import { EncounterStart } from '@lunego/kit-runtime'
import { AdvanceRun, Revive } from '../schema.js'
import { beginScenario, clearFloor, createScenario, readHud } from './scenario.js'

it('rejects advancing an unfinished floor and reviving a living actor', async () => {
  const game = createScenario()
  beginScenario(game)
  const advance = game.send(AdvanceRun, {})
  const revive = game.send(Revive, {})
  game.step()
  expect(await advance).toEqual({ status: 'rejected', reason: 'not_completed' })
  expect(await revive).toEqual({ status: 'rejected', reason: 'not_dead' })
  expect(readHud(game).stage).toBe(1)
})

it('revives an equipped, leveled character and clears the old encounter without resetting profile', async () => {
  const game = createScenario()
  beginScenario(game)
  clearFloor(game)
  void game.send(AdvanceRun, {})
  game.step()
  void game.send(EncounterStart.type, { encounter: 'p9.encounter' })
  game.step(2)
  const before = readHud(game)
  expect(before.weaponPower).toBeGreaterThan(0)
  expect(before.level).toBeGreaterThan(1)
  game.step(2400)
  expect(readHud(game).outcome).toBe('defeat')
  const revive = game.send(Revive, {})
  game.step()
  expect(await revive).toEqual({ status: 'ok' })
  void game.send(EncounterStart.type, { encounter: 'p9.encounter' })
  game.step()
  const after = readHud(game)
  expect(after).toMatchObject({ outcome: 'playing', stage: 2, hp: before.maxHp,
    level: before.level, xp: before.xp, weaponPower: before.weaponPower })
  expect(after.inventory).toEqual(before.inventory)
  expect(after.remaining).toBe(3)
  expect(after.gold).toBe(Math.floor(before.gold * 0.8))
})
