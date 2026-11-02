import { describe, expect, it } from 'vitest'
import { createGame } from '@lunego/host'
import { MotionFeature } from '../logic/index.js'
import { MoveIntent, Start } from '../schema.js'

function create(): ReturnType<typeof createGame> {
  return createGame({ features: [MotionFeature], dt: 1 / 60 })
}

function startGame(game: ReturnType<typeof createGame>): void {
  void game.send(Start, {})
  game.step()
  void game.send(MoveIntent, { x: 1, y: 0.5 })
}

describe('motion template', () => {
  it('runs 100 ticks and is transparent across save/load and replay', () => {
    const full = create()
    startGame(full)
    for (let tick = 0; tick < 100; tick += 1) {
      full.step()
    }
    const fullHash = full.frame.hash
    const replay = full.replay(full.exportReplay())
    expect(replay.ok).toBe(true)

    const split = create()
    startGame(split)
    for (let tick = 0; tick < 50; tick += 1) {
      split.step()
    }
    const save = JSON.parse(JSON.stringify(split.save())) as ReturnType<typeof split.save>
    const restored = create()
    restored.load(save)
    expect(restored.frame.hash).toBe(split.frame.hash)
    for (let tick = 0; tick < 50; tick += 1) {
      restored.step()
    }
    expect(restored.frame.hash).toBe(fullHash)
  })
})
