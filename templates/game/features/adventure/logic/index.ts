import { defineFeature } from '@lunego/core'
import {
  ActorFacing, ActorMoveSpeed, ActorPosition, ActorVelocity, AiState, CombatDead, CombatDefenses,
  CombatHealth, CombatTeam, ContentTag, EncounterMember, EncounterStateModel, GroundItem, WalletState, ZoneStateModel,
} from '@lunego/kit-runtime'
import { handlers, systems } from '../_generated/registry.js'
import { AdvanceRun, Revive, RunProgress, CharacterProfile, HudQuery, Start } from '../schema.js'

export const AdventureFeature = defineFeature({
  name: 'adventure',
  writes: [ActorFacing, ActorMoveSpeed, ActorPosition, ActorVelocity, AiState, CombatDead, CombatDefenses,
    CombatHealth, CombatTeam, ContentTag, EncounterMember, EncounterStateModel, GroundItem, WalletState, ZoneStateModel],
  schema: {
    models: [CharacterProfile, RunProgress],
    commands: [Start, AdvanceRun, Revive],
  },
  queries: [HudQuery],
  systems,
  handlers,
})
