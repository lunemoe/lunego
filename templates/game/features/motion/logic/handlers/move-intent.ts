import { defineHandler, ok } from '@lunego/core'
import { MoveIntent, Player, Velocity } from '../../schema.js'

const SPEED = 90

export default defineHandler(MoveIntent, {
  writes: [Velocity],
  run(ctx, payload) {
    const velocity = ctx.write(Velocity)
    for (const entity of ctx.query(Player, Velocity)) {
      velocity.x[entity] = payload.x * SPEED
      velocity.y[entity] = payload.y * SPEED
    }
    return ok()
  },
})
