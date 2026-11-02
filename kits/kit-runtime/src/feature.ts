import { createHandlers } from './handlers.js'
import { parseInventory, parseStatusSnapshot, questLog } from './state-bridge.js'
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
import { StatusSet } from '@lunego/kit-status'
import { resolveDamage } from '@lunego/kit-combat'
import { Perception } from '@lunego/kit-ai'
import {
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
  const { content, hooks = {} } = options
  const { spawn, move, attack, buy, pickup, equip, acceptQuest, turnInQuest, dialogueStart, dialogueChoose, applyStatus, encounterStart, usePortal } = createHandlers(content, hooks)
  const components: readonly ComponentDef[] = [
    ActorPosition, ActorVelocity, ActorFacing, ActorMoveSpeed,
    CombatTeam, CombatHealth, CombatDefenses,
    StatusState, AiState, GroundItem, ContentTag,
    InventoryState, EquipmentState, WalletState, ProgressionSnapshot,
    QuestLogSnapshot, DialogueSnapshot, EncounterMember,
  ]

  const integrate = defineSystem({
    name: `${options.name}.actor.integrate`,
    phase: 'update',
    reads: [ActorVelocity],
    writes: [ActorPosition],
    run(ctx) {
      const position = ctx.write(ActorPosition)
      const velocity = ctx.read(ActorVelocity)
      for (const entity of ctx.query(ActorPosition, ActorVelocity)) {
        position.x[entity] += velocity.x[entity] * ctx.time.dt
        position.y[entity] += velocity.y[entity] * ctx.time.dt
      }
    },
  })
  const aiThink = defineSystem({
    name: `${options.name}.ai.think`,
    phase: 'pre',
    reads: [AiState, ActorPosition, ActorFacing, ActorVelocity, CombatTeam, CombatDead],
    writes: [AiState, ActorVelocity, ActorFacing],
    emits: [DamageRequested],
    run(ctx) {
      const position = ctx.read(ActorPosition)
      const team = ctx.read(CombatTeam)
      const velocity = ctx.write(ActorVelocity)
      const facing = ctx.write(ActorFacing)
      const aiView = ctx.write(AiState)
      for (const entity of ctx.query(AiState, ActorPosition)) {
        const state = ctx.read(AiState)
        const profile = content.aiProfiles.get(state.profile[entity] ?? '')
        if (profile === undefined) {
          aiView.target[entity] = 0
          aiView.lastSeenTick[entity] = 0
          velocity.x[entity] = 0
          velocity.y[entity] = 0
          continue
        }
        const ownTeam = team.side[entity] ?? ''
        const candidates = ctx.query(ActorPosition, CombatTeam)
          .filter((candidate) => candidate !== entity &&
            !ctx.has(candidate, CombatDead) &&
            team.side[candidate] !== ownTeam &&
            hooks.hasLineOfSight?.(ctx, entity, candidate) !== false)
          .map((candidate) => ({
            entity: candidate,
            x: position.x[candidate],
            y: position.y[candidate],
          }))
        const perception = new Perception({
          range: profile.sightRange,
          coneDot: profile.coneDot,
          memoryTicks: profile.memoryTicks,
        })
        const memory = (state.memory[entity] ?? []).filter((entry) =>
          entry.entity !== 0 &&
          entry.entity !== entity &&
          ctx.has(entry.entity, ActorPosition) &&
          !ctx.has(entry.entity, CombatDead),
        )
        if (memory.length > 0) {
          perception.restore({
            version: 1,
            memory: memory.map((entry) => ({
              entity: entry.entity,
              x: entry.x,
              y: entry.y,
              lastSeenTick: entry.lastSeenTick,
            })),
            seen: memory.map((entry) => entry.entity),
          })
        }
        const seen = perception.observe(
          { entity, x: position.x[entity], y: position.y[entity] },
          { x: facing.x[entity], y: facing.y[entity] },
          candidates,
          ctx.tick,
        )
        aiView.memory[entity] = seen.map((entry) => ({
          entity: entry.entity,
          x: entry.x,
          y: entry.y,
          lastSeenTick: entry.lastSeenTick,
        }))
        let nearest = 0
        let nearestDistance = Number.POSITIVE_INFINITY
        for (const entry of seen) {
          if (!entry.visible) continue
          const dx = entry.x - position.x[entity]
          const dy = entry.y - position.y[entity]
          const distance = ctx.math.sqrt(dx * dx + dy * dy)
          if (distance < nearestDistance || (distance === nearestDistance && entry.entity < nearest)) {
            nearest = entry.entity
            nearestDistance = distance
          }
        }
        aiView.target[entity] = nearest
        const nearestEntry = seen.find((entry) => entry.entity === nearest)
        aiView.lastSeenTick[entity] = nearestEntry?.lastSeenTick ?? 0
        if (nearest === 0) {
          velocity.x[entity] = 0
          velocity.y[entity] = 0
          continue
        }
        const dx = position.x[nearest] - position.x[entity]
        const dy = position.y[nearest] - position.y[entity]
        const distance = ctx.math.sqrt(dx * dx + dy * dy)
        const length = distance === 0 ? 1 : distance
        facing.x[entity] = dx / length
        facing.y[entity] = dy / length
        if (distance > profile.attackRange) {
          velocity.x[entity] = facing.x[entity] * profile.speed
          velocity.y[entity] = facing.y[entity] * profile.speed
        } else {
          velocity.x[entity] = 0
          velocity.y[entity] = 0
          const cooldown = profile.attackCooldownTicks ?? 0
          if (ctx.tick - (state.lastAttackTick[entity] ?? 0) < cooldown) continue
          const ability = profile.ability ?? ''
          const damage = hooks.attackDamage?.(ctx, entity, nearest, ability) ??
            content.abilities.get(ability)?.damage
          if (damage !== null && damage !== undefined) {
            ctx.emit(DamageRequested, {
              target: nearest,
              source: entity,
              amount: damage.amount,
              damageType: damage.type,
            })
            aiView.lastAttackTick[entity] = ctx.tick
          }
        }
      }
    },
  })
  const statusTick = defineSystem({
    name: `${options.name}.status.tick`,
    phase: 'pre',
    reads: [StatusState],
    writes: [StatusState],
    emits: [StatusPeriodic, DamageRequested, Damaged, Died],
    run(ctx) {
      const view = ctx.write(StatusState)
      for (const entity of ctx.query(StatusState)) {
        const value = view.snapshot[entity]
        const set = new StatusSet()
        if (value !== undefined && value !== '') {
          set.restore(parseStatusSnapshot(value), content.statuses)
        }
        const events = set.tick(ctx.tick)
        for (const event of events) {
          ctx.emit(StatusPeriodic, {
            target: entity,
            status: event.status,
            kind: event.kind,
            amount: event.amount,
          })
          if (event.kind === 'dot') {
            ctx.emit(DamageRequested, {
              target: entity,
              source: 0,
              amount: event.amount,
              damageType: 'status',
            })
          }
        }
        view.snapshot[entity] = JSON.stringify(set.serialize())
      }
    },
  })
  const combatResolve = defineSystem({
    name: `${options.name}.combat.resolve`,
    phase: 'post',
    reads: [CombatHealth, CombatDefenses, ActorPosition],
    writes: [CombatHealth, CombatDead],
    emits: [Damaged, Died],
    listens: [DamageRequested],
    run(ctx) {
      const health = ctx.write(CombatHealth)
            for (const packet of ctx.events(DamageRequested)) {
        const target = packet.target
        if (!ctx.has(target, CombatHealth) || ctx.has(target, CombatDead)) {
          continue
        }
        const defenses = ctx.read(CombatDefenses)
        const entered = hooks.resolveDamage?.({
          target,
          source: packet.source,
          amount: packet.amount,
          damageType: packet.damageType,
        }, {
          health: health.current[target],
          shield: defenses.shield[target],
          armor: defenses.armor[target],
          dodge: defenses.dodge[target],
          block: defenses.block[target],
        })
        const result = entered ?? resolveDamage(
          { amount: packet.amount, type: packet.damageType },
          {
            health: health.current[target],
            shield: defenses.shield[target],
            armor: defenses.armor[target],
            dodgeChance: defenses.dodge[target],
            blockChance: defenses.block[target],
          },
        )
        health.current[target] = result.health
        if (result.dead) {
          ctx.add(target, CombatDead)
        }
        ctx.emit(Damaged, {
          target,
          source: packet.source,
          amount: result.applied,
          damageType: packet.damageType,
        })
        if (result.dead) {
          ctx.emit(Died, { target, source: packet.source })
        }
      }
    },
  })
  const lootDrop = defineSystem({
    name: `${options.name}.loot.drop`,
    phase: 'post',
    reads: [ActorPosition],
    writes: [GroundItem],
    emits: [ItemDropped],
    listens: [Died],
    run(ctx) {
      for (const event of ctx.events(Died)) {
        if (ctx.has(event.target, GroundItem)) {
          continue
        }
        const item = hooks.dropFor?.(ctx, event.target, event.source)
        if (item === null || item === undefined) {
          continue
        }
        const entity = ctx.spawn({
          'runtime.items.ground': {
            item: JSON.stringify(item),
          },
        })
        ctx.emit(ItemDropped, { entity, item: item.contentId })
      }
    },
  })
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
      models: [EncounterStateModel, ZoneStateModel, ItemIdentityModel, FogStateModel],
      events: [DamageRequested, Damaged, Died, StatusPeriodic, QuestChanged, ItemPicked, ItemDropped, ZoneChanged, DialogueChanged, ActorSpawned],
      commands: [SpawnActor, MoveIntent, AttackTarget, BuyItem, PickupItem, EquipItem, AcceptQuest, TurnInQuest, DialogueStart, DialogueChoose, ApplyStatus, EncounterStart, UsePortal],
    },
    systems: [aiThink, statusTick, integrate, combatResolve, lootDrop, questRecord],
    handlers: [
      defineHandler(SpawnActor, { writes: [...components, ActorControllable], emits: [ActorSpawned], run: spawn.run }),
      defineHandler(MoveIntent, { reads: [ActorControllable], writes: [ActorVelocity, ActorFacing], run: move.run }),
      defineHandler(AttackTarget, { reads: [InventoryState, CombatTeam, CombatHealth, CombatDead], writes: [CombatDead], emits: [DamageRequested], run: attack.run }),
      defineHandler(BuyItem, { reads: [InventoryState, WalletState], writes: [InventoryState, WalletState], run: buy.run }),
      defineHandler(PickupItem, { reads: [GroundItem, InventoryState], writes: [GroundItem, InventoryState], emits: [ItemPicked], run: pickup.run }),
      defineHandler(EquipItem, { reads: [InventoryState, EquipmentState], writes: [InventoryState, EquipmentState], run: equip.run }),
      defineHandler(AcceptQuest, { reads: [InventoryState], writes: [QuestLogSnapshot], emits: [QuestChanged], run: acceptQuest.run }),
      defineHandler(TurnInQuest, { reads: [InventoryState], writes: [QuestLogSnapshot], emits: [QuestChanged], run: turnInQuest.run }),
      defineHandler(DialogueStart, { reads: [InventoryState], writes: [DialogueSnapshot], emits: [DialogueChanged], run: dialogueStart.run }),
      defineHandler(DialogueChoose, { reads: [InventoryState], writes: [DialogueSnapshot], emits: [DialogueChanged], run: dialogueChoose.run }),
      defineHandler(ApplyStatus, { reads: [StatusState], writes: [StatusState], run: applyStatus.run }),
      defineHandler(EncounterStart, { reads: [EncounterStateModel], writes: [ActorPosition, ActorVelocity, ActorFacing, ActorMoveSpeed, CombatTeam, CombatHealth, CombatDefenses, ContentTag, AiState, EncounterStateModel, EncounterMember], emits: [ActorSpawned], run: encounterStart.run }),
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
}

export type { InventoryData, EquipmentData }
