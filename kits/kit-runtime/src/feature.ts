import { actorSystems } from './actor-systems.js'
import { combatSystems } from './combat-systems.js'
import { encounterSystem } from './encounter.js'
import { createHandlers } from './handlers.js'
import { parseEncounterSave, parseEquipment, parseInventory, questLog } from './state-bridge.js'
import type { EquipmentData, InventoryData, RuntimeFeatureOptions } from './types.js'
import {
  defineFeature,
  defineHandler,
  defineQuery,
  defineSystem,
  type ComponentDef,
  type FeatureDef,
  type QueryContext,
} from '@lunego/core'
import {
  AbilityCooldowns, AbilityUsed, EncounterCompleted, EncounterPhaseChanged, UseItem, SellItem,
  ActorControllable,
  ActorFacing,
  ActorSpawned,
  ActorMoveSpeed,
  ActorPosition,
  ActorVelocity,
  AiState,
  CombatDead,
  CombatTeam,
  CombatDefenses,
  CombatHealth,
  AcceptQuest,
  ApplyStatus,
  AttackTarget,
  BuyItem,
  ContentTag,
  DamageRequested,
  Damaged,
  DialogueChanged,
  DialogueChoose,
  DialogueSnapshot,
  DialogueStart,
  Died,
  EncounterMember,
  EncounterStart,
  EncounterStateModel,
  EquipItem,
  EquipmentState,
  FogStateModel,
  GroundItem,
  InventoryState,
  ItemDropped,
  ItemIdentityModel,
  ItemPicked,
  MoveIntent,
  PickupItem,
  ProgressionSnapshot,
  QuestChanged,
  QuestLogSnapshot,
  StatusPeriodic,
  SpawnActor,
  StatusState,
  TurnInQuest,
  UsePortal,
  WalletState,
  ZoneChanged,
  ZoneStateModel,
} from './schema.js'

export function createRuntimeFeature(options: RuntimeFeatureOptions): FeatureDef {
  if (options.pickupRange !== undefined && (!Number.isFinite(options.pickupRange) || options.pickupRange < 0)) throw new Error('pickupRange must be non-negative')
  if (options.waveDelayTicks !== undefined && (!Number.isInteger(options.waveDelayTicks) || options.waveDelayTicks < 0)) throw new Error('waveDelayTicks must be a non-negative integer')
  const { content, hooks = {} } = options
  const { spawn, move, attack, buy, sell, pickup, equip, useItem, acceptQuest, turnInQuest, dialogueStart, dialogueChoose, applyStatus, encounterStart, usePortal } = createHandlers(content, hooks, options)
  const components: readonly ComponentDef[] = [
    ActorPosition, ActorVelocity, ActorFacing, ActorMoveSpeed,
    CombatTeam, CombatHealth, CombatDefenses,
    StatusState, AiState, GroundItem, ContentTag,
    InventoryState, EquipmentState, WalletState, ProgressionSnapshot,
    QuestLogSnapshot, DialogueSnapshot, EncounterMember,
  ]

  const questRecord = defineSystem({
    name: `${options.name}.quest.record`,
    phase: 'post',
    reads: [ContentTag],
    writes: [QuestLogSnapshot],
    emits: [QuestChanged],
    listens: [Died, ItemPicked],
    run(ctx) {
      const snapshotView = ctx.write(QuestLogSnapshot)
      for (const entity of ctx.query(QuestLogSnapshot)) {
        const log = questLog(content, snapshotView.snapshot[entity])
        for (const event of ctx.events(Died)) {
          const tag = ctx.has(event.target, ContentTag) ? (ctx.read(ContentTag).contentId[event.target] ?? '') : ''
          if (tag !== '') log.record({ type: 'kill', target: tag }, ctx.tick)
        }
        for (const event of ctx.events(ItemPicked)) {
          log.record({ type: 'collect', target: event.item }, ctx.tick)
        }
        snapshotView.snapshot[entity] = JSON.stringify(log.serialize())
        for (const id of content.quests.keys()) {
          const state = log.state(id)
          if (state !== null) {
            ctx.emit(QuestChanged, { quest: id, status: state.status })
          }
        }
      }
    },
  })

  return defineFeature({
    name: options.name,
    schema: {
      components,
      tags: [CombatDead, ActorControllable],
      models: [AbilityCooldowns, EncounterStateModel, ZoneStateModel, ItemIdentityModel, FogStateModel],
      events: [AbilityUsed, EncounterCompleted, EncounterPhaseChanged, DamageRequested, Damaged, Died, StatusPeriodic, QuestChanged, ItemPicked, ItemDropped, ZoneChanged, DialogueChanged, ActorSpawned],
      commands: [SellItem, UseItem, SpawnActor, MoveIntent, AttackTarget, BuyItem, PickupItem, EquipItem, AcceptQuest, TurnInQuest, DialogueStart, DialogueChoose, ApplyStatus, EncounterStart, UsePortal],
    },
    systems: [...actorSystems(options), ...combatSystems(options), questRecord, encounterSystem(options, components)],
    handlers: [
      defineHandler(SpawnActor, { writes: [...components, ActorControllable], emits: [ActorSpawned], run: spawn.run }),
      defineHandler(MoveIntent, { reads: [ActorControllable, ActorMoveSpeed, CombatDead, CombatHealth], writes: [ActorVelocity, ActorFacing], run: move.run }),
      defineHandler(AttackTarget, { reads: [InventoryState, EquipmentState, CombatTeam, CombatHealth, CombatDead, ActorPosition, ActorFacing, AbilityCooldowns, ...(options.hookReads ?? [])], writes: [AbilityCooldowns], emits: [DamageRequested, AbilityUsed], run: attack.run }),
      defineHandler(SellItem, { reads: [InventoryState, WalletState], writes: [InventoryState, WalletState], run: sell.run }),
      defineHandler(BuyItem, { reads: [InventoryState, WalletState], writes: [InventoryState, WalletState], run: buy.run }),
      defineHandler(PickupItem, { reads: [GroundItem, InventoryState, ActorPosition, CombatDead, CombatHealth], writes: [GroundItem, ActorPosition, InventoryState], emits: [ItemPicked], run: pickup.run }),
      defineHandler(UseItem, { reads: [InventoryState, CombatHealth, CombatDead], writes: [InventoryState, CombatHealth], run: useItem.run }),
      defineHandler(EquipItem, { reads: [InventoryState, EquipmentState], writes: [InventoryState, EquipmentState], run: equip.run }),
      defineHandler(AcceptQuest, { reads: [InventoryState], writes: [QuestLogSnapshot], emits: [QuestChanged], run: acceptQuest.run }),
      defineHandler(TurnInQuest, { reads: [InventoryState], writes: [QuestLogSnapshot], emits: [QuestChanged], run: turnInQuest.run }),
      defineHandler(DialogueStart, { reads: [InventoryState], writes: [DialogueSnapshot], emits: [DialogueChanged], run: dialogueStart.run }),
      defineHandler(DialogueChoose, { reads: [InventoryState], writes: [DialogueSnapshot], emits: [DialogueChanged], run: dialogueChoose.run }),
      defineHandler(ApplyStatus, { reads: [StatusState], writes: [StatusState], run: applyStatus.run }),
      defineHandler(EncounterStart, { reads: [EncounterStateModel], writes: [ActorPosition, ActorVelocity, ActorFacing, ActorMoveSpeed, CombatTeam, CombatHealth, CombatDefenses, ContentTag, AiState, EncounterStateModel, EncounterMember], emits: [ActorSpawned, EncounterPhaseChanged], run: encounterStart.run }),
      defineHandler(UsePortal, { reads: [ZoneStateModel], writes: [ZoneStateModel], emits: [ZoneChanged], run: usePortal.run }),
    ],
    queries: [
      defineQuery({
        name: `${options.name}.inventory.view`,
        reads: [InventoryState],
        run(ctx) {
          const player = ctx.query(InventoryState)[0]
          return player === undefined ? null : parseInventory(ctx.read(InventoryState).snapshot[player])
        },
      }),
    ],
  })
}

export const RuntimeQueries = {
  inventoryView: (ctx: QueryContext): InventoryData | null => {
    const player = ctx.query(InventoryState)[0]
    return player === undefined ? null : parseInventory(ctx.read(InventoryState).snapshot[player])
  },
  equipmentView: (ctx: QueryContext, entity: number): EquipmentData => parseEquipment(ctx.read(EquipmentState).snapshot[entity]),
  encounterView: (ctx: QueryContext) => {
    const state = ctx.model(EncounterStateModel)
    const saved = parseEncounterSave(state.snapshot)
    return saved === null ? null : {
      encounter: saved.encounter, waveIndex: saved.runtime.waveIndex, phase: saved.runtime.phase,
      completed: state.completed, nextWaveTick: state.nextWaveTick,
    }
  },
}

export type { InventoryData, EquipmentData }
