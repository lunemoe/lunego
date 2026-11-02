import { defineSystem } from '@lunego/core'
import { Position, Velocity } from '../../schema.js'

export default defineSystem({
  name: 'motion.integrate',
  phase: 'update',
  reads: [Velocity],
  writes: [Position],
  run(ctx) {
    const position = ctx.write(Position)
    const velocity = ctx.read(Velocity)
    for (const entity of ctx.query(Position, Velocity)) {
      position.x[entity] += velocity.x[entity] * ctx.time.dt
      position.y[entity] += velocity.y[entity] * ctx.time.dt
    }
  },
})
