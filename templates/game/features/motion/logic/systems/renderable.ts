import { defineSystem } from '@lunego/core'
import { ActorSpawned } from '@lunego/kit-runtime'
import { Renderable } from '../../schema.js'

const SPECS: Record<string, { width: number; height: number; color: number; texture: string | undefined }> = {
  'demo.player': { width: 16, height: 16, color: 0x58c8ff, texture: undefined },
  'demo.foe': { width: 16, height: 16, color: 0xd86a7a, texture: undefined },
  'demo.crate': { width: 16, height: 16, color: 0xd88a4a, texture: 'runtime-crate' },
}

export default defineSystem({
  name: 'demo.presentation.renderable',
  phase: 'pre',
  listens: [ActorSpawned],
  writes: [Renderable],
  run(ctx) {
    for (const event of ctx.events(ActorSpawned)) {
      if (ctx.has(event.entity, Renderable)) continue
      const spec = SPECS[event.prefab]
      if (spec === undefined) continue
      ctx.add(event.entity, Renderable, spec)
    }
  },
})
