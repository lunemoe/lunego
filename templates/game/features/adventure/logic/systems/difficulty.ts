import { defineSystem } from '@lunego/core'
import { ActorSpawned, CombatHealth, CombatTeam } from '@lunego/kit-runtime'
import { RunProgress } from '../../schema.js'

export default defineSystem({
  name: 'p9.difficulty', phase: 'pre',
  reads: [CombatTeam, RunProgress], writes: [CombatHealth],
  listens: [{ event: ActorSpawned, prev: true }],
  run(ctx) {
    const multiplier = 1 + (ctx.model(RunProgress).stage - 1) * 0.35
    for (const event of ctx.prev(ActorSpawned)) {
      if (!ctx.has(event.entity, CombatTeam) || ctx.read(CombatTeam).side[event.entity] !== 'enemy') continue
      const health = ctx.write(CombatHealth)
      health.max[event.entity] = Math.ceil(health.max[event.entity] * multiplier)
      health.current[event.entity] = health.max[event.entity]
    }
  },
})
