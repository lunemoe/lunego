import { defineFeature } from '@lunego/core'
import { handlers, systems } from '../_generated/registry.js'
import { CharacterProfile, HudQuery, Renderable, Start } from '../schema.js'

export const MotionFeature = defineFeature({
  name: 'motion',
  schema: {
    components: [Renderable],
    models: [CharacterProfile],
    commands: [Start],
  },
  queries: [HudQuery],
  systems,
  handlers,
})
