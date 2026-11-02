import { defineHandler, ok } from '@lunego/core'
import { MoveDust, MoveIntent, Player, Position, Velocity } from '../../schema.js'

const SPEED = 90

export default defineHandler(MoveIntent, {
  reads: [Player, Position],
  writes: [Velocity],
  cues: [MoveDust],
  run(ctx, payload) {
    const velocity = ctx.write(Velocity)
    const positions = ctx.read(Position)
    for (const entity of ctx.query(Player, Velocity)) {
      velocity.x[entity] = payload.x * SPEED
      velocity.y[entity] = payload.y * SPEED
      if (payload.x !== 0 || payload.y !== 0) {
        ctx.cue(MoveDust, {
          at: { x: positions.x[entity], y: positions.y[entity] + 8 },
        })
      }
    }
    return ok()
  },
})
