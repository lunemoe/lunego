import { defineHandler, ok } from '@lunego/core'
import { Player, Position, Renderable, Start, Velocity } from '../../schema.js'

export default defineHandler(Start, {
  writes: [Position, Velocity, Player, Renderable],
  run(ctx) {
    ctx.spawn({
      Position: { x: 240, y: 150 },
      Velocity: { x: 0, y: 0 },
      Player: true,
      Renderable: { width: 16, height: 16, color: 0x58c8ff },
    })
    ctx.spawn({
      Position: { x: 320, y: 220 },
      Renderable: { width: 16, height: 16, color: 0xd88a4a, texture: 'runtime-crate' },
    })
    return ok()
  },
})
