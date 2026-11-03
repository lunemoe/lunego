import { expect, it } from 'vitest'
import { createGame } from '../index.js'

it('isolates failing view subscribers from simulation, other views and load', () => {
  const game = createGame({ features: [], seed: 7 })
  const failure = new Error('view render failed')
  const ticks: number[] = []
  game.subscribeFrames((frame) => { if (frame.tick > 0) throw failure })
  game.subscribeFrames((frame) => ticks.push(frame.tick))
  expect(() => game.step(3)).not.toThrow()
  expect(game.crashReport).toBeNull()
  expect(game.viewError).toBe(failure)
  expect(ticks).toEqual([0, 1, 2, 3])
  const saved = game.saveGame()
  expect(() => game.loadGame(saved)).not.toThrow()
  expect(game.crashReport).toBeNull()
  expect(game.viewError).toBe(failure)
  expect(() => game.subscribeFrames(() => { throw failure })).not.toThrow()
})
