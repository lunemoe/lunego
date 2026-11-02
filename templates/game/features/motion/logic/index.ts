import { defineFeature } from '@lunego/core'
import { handlers, systems } from '../_generated/registry.js'
import {
  MoveDust,
  MoveIntent,
  Player,
  Position,
  Renderable,
  Start,
  Velocity,
} from '../schema.js'

export const MotionFeature = defineFeature({
  name: 'motion',
  schema: {
    components: [Position, Velocity, Renderable],
    tags: [Player],
    commands: [Start, MoveIntent],
    cues: [MoveDust],
  },
  systems,
  handlers,
})
