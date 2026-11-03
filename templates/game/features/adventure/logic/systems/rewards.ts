import { defineSystem } from '@lunego/core'
import { AiState, CombatHealth, CombatTeam, ContentTag, Died, EncounterStateModel, InventoryState, WalletState } from '@lunego/kit-runtime'
import { CharacterProfile, RunProgress } from '../../schema.js'

export default defineSystem({
  name: 'p9.rewards', phase: 'post',
  reads: [CombatTeam, ContentTag, InventoryState, EncounterStateModel],
  writes: [CharacterProfile, CombatHealth, WalletState, RunProgress, AiState],
  listens: [Died],
  run(ctx) {
    const player = ctx.query(InventoryState)[0]
    if (player === undefined) return
    const health = ctx.write(CombatHealth)
    const profile = ctx.mutModel(CharacterProfile)
    for (const event of ctx.events(Died)) {
      if (ctx.read(CombatTeam).side[event.target] !== 'enemy' || event.source !== player) continue
      const boss = ctx.read(ContentTag).contentId[event.target] === 'p9.warden'
      profile.kills += 1
      profile.xp += boss ? 60 : 12
      ctx.write(WalletState).gold[player] += boss ? 30 : 6
      while (profile.xp >= profile.level * 20) {
        profile.xp -= profile.level * 20
        profile.level += 1
        health.max[player] += 8
        if (health.current[player] > 0) health.current[player] = Math.min(health.max[player], health.current[player] + 12)
      }
    }
    for (const entity of ctx.query(AiState, ContentTag, CombatHealth)) {
      if (ctx.read(ContentTag).contentId[entity] !== 'p9.warden') continue
      if (health.current[entity] > 0 && health.current[entity] <= health.max[entity] / 2) {
        ctx.write(AiState).profile[entity] = 'p9.enraged-ai'
      }
    }
    if (ctx.model(RunProgress).endedAt === 0 &&
      (health.current[player] <= 0 || ctx.model(EncounterStateModel).completed)) {
      ctx.mutModel(RunProgress).endedAt = ctx.tick
    }
  },
})
