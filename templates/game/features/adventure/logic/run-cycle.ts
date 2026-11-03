import type { HandlerContext } from '@lunego/core'
import {
  ActorFacing, ActorMoveSpeed, ActorPosition, ActorVelocity, AiState, CombatDead, CombatDefenses,
  CombatHealth, CombatTeam, ContentTag, EncounterMember, EncounterStateModel, GroundItem,
} from '@lunego/kit-runtime'
import { RunProgress } from '../schema.js'

export const CycleWrites = [
  ActorFacing, ActorMoveSpeed, ActorPosition, ActorVelocity, AiState, CombatDead,
  CombatDefenses, CombatHealth, CombatTeam, ContentTag, EncounterMember, EncounterStateModel, GroundItem, RunProgress,
] as const

export function resetEncounter(ctx: HandlerContext, player: number): void {
  const teams = ctx.read(CombatTeam)
  for (const entity of ctx.query(CombatTeam)) {
    if (teams.side[entity] === 'enemy') ctx.despawn(entity)
  }
  for (const entity of ctx.query(GroundItem)) ctx.despawn(entity)
  const encounter = ctx.mutModel(EncounterStateModel)
  encounter.snapshot = ''
  encounter.completed = false
  encounter.nextWaveTick = 0
  encounter.spawnTick = 0
  ctx.mutModel(RunProgress).endedAt = 0
  const health = ctx.write(CombatHealth)
  health.current[player] = health.max[player]
  ctx.write(ActorVelocity).x[player] = 0
  ctx.write(ActorVelocity).y[player] = 0
  ctx.write(ActorPosition).x[player] = 240
  ctx.write(ActorPosition).y[player] = 150
}
