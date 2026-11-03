import { describe, expect, it } from 'vitest'
import { ActorPosition, CombatHealth, EncounterStart, MoveIntent } from '@lunego/kit-runtime'
import { AdvanceRun } from '../schema.js'
import { beginScenario, clearFloor, createScenario, readHud } from './scenario.js'

describe('p9 playable loop', () => {
  it('stays inside the arena and exposes ability cooldowns', () => {
    const game = createScenario()
    beginScenario(game)
    void game.send(MoveIntent, { x: -1, y: -1 })
    game.step(600)
    const point = game.view.get(readHud(game).player, ActorPosition)!
    expect(point.x).toBeGreaterThanOrEqual(16)
    expect(point.y).toBeGreaterThanOrEqual(16)
    expect(readHud(game).waveCount).toBe(3)
    expect(readHud(game).cooldowns.strike).toBe(0)
  })

  it('clears two floors, retains growth, scales difficulty and restores deterministic progress', async () => {
    const run = async () => {
      const game = createScenario()
      beginScenario(game)
      clearFloor(game)
      expect(readHud(game)).toMatchObject({ outcome: 'victory', kills: 8, stage: 1 })
      const first = readHud(game)
      expect(first.level).toBeGreaterThan(1)
      expect(first.gold).toBeGreaterThan(50)
      expect(first.weaponPower).toBeGreaterThan(0)
      const advance = game.send(AdvanceRun, {})
      game.step()
      expect(await advance).toEqual({ status: 'ok' })
      void game.send(EncounterStart.type, { encounter: 'p9.encounter' })
      game.step(2)
      const next = readHud(game)
      expect(next).toMatchObject({ stage: 2, level: first.level, weaponPower: first.weaponPower, gold: first.gold })
      expect(game.view.get(next.enemy, CombatHealth)?.max).toBe(14)
      const pair = game.saveGame()
      const restored = createScenario()
      restored.loadGame(pair)
      clearFloor(game)
      clearFloor(restored)
      expect(readHud(game)).toMatchObject({ outcome: 'victory', kills: 16, stage: 2 })
      expect(restored.frame.hash).toBe(game.frame.hash)
      return game.frame.hash
    }
    expect(await run()).toBe(await run())
  })

  it('ends on player death and restores an entire run with the same hash', () => {
    const game = createScenario()
    beginScenario(game)
    const save = game.saveGame()
    const hash = game.frame.hash
    game.step(2400)
    expect(game.view.get(readHud(game).player, CombatHealth)?.current).toBe(0)
    expect(readHud(game).outcome).toBe('defeat')
    game.loadGame(save)
    expect(game.frame.hash).toBe(hash)
    expect(readHud(game)).toMatchObject({ outcome: 'playing', hp: 40 })
  })
})
