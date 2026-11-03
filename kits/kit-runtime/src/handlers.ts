import { ok, reject, type HandlerContext } from '@lunego/core'
import { performAttack } from './attack.js'
import { spawnEncounterActors } from './encounter.js'
import { EncounterRuntime } from '@lunego/kit-encounter'
import { StatusSet } from '@lunego/kit-status'
import type { RuntimeContent } from './content.js'
import {
  dialogueRuntime,
  parseDialogueSave,
  parseEncounterSave,
  parseItemSnapshot,
  parseStatusSnapshot,
  parseZoneSnapshot,
  playerEntity,
  questLog,
  readEquipment,
  readInventory,
  saveDialogue,
  writeEquipment,
  writeInventory,
} from './state-bridge.js'
import {
  ActorControllable,
  ActorMoveSpeed,
  ActorPosition,
  ActorFacing,
  ActorSpawned,
  ActorVelocity,
  CombatDead,
  CombatHealth,
  DialogueChanged,
  DialogueSnapshot,
  EncounterPhaseChanged,
  EncounterStateModel,
  GroundItem,
  ItemPicked,
  StatusState,
  WalletState,
  QuestChanged,
  QuestLogSnapshot,
  ZoneChanged,
  ZoneStateModel,
} from './schema.js'
import type { RuntimeFeatureOptions, RuntimeHooks } from './types.js'

export function createHandlers(content: RuntimeContent, hooks: RuntimeHooks, options: RuntimeFeatureOptions) {
  const spawn = {
    run(ctx: HandlerContext, payload: { readonly prefab: string; readonly controllable: boolean | undefined }) {
      const prefab = content.prefabs.get(payload.prefab)
      if (prefab === undefined) return reject('unknown_prefab')
      const entity = ctx.spawn(prefab)
      if (payload.controllable === true) ctx.add(entity, ActorControllable)
      ctx.emit(ActorSpawned, { entity, prefab: payload.prefab })
      return ok()
    },
  }
  const move = {
    run(ctx: HandlerContext, payload: { readonly x: number; readonly y: number }) {
      const velocity = ctx.write(ActorVelocity)
      const facing = ctx.write(ActorFacing)
      const length = ctx.math.sqrt(payload.x * payload.x + payload.y * payload.y)
      const divisor = Math.max(1, length)
      for (const entity of ctx.query(ActorControllable, ActorVelocity, ActorFacing)) {
        const dead = ctx.has(entity, CombatDead) || (ctx.has(entity, CombatHealth) && ctx.read(CombatHealth).current[entity] <= 0)
        const speed = dead ? 0 : (ctx.has(entity, ActorMoveSpeed) ? ctx.read(ActorMoveSpeed).value[entity] : 0)
        velocity.x[entity] = payload.x / divisor * speed
        velocity.y[entity] = payload.y / divisor * speed
        if (length > 0 && !dead) {
          facing.x[entity] = payload.x / length
          facing.y[entity] = payload.y / length
        }
      }
      return ok()
    },
  }
  const attack = {
    run(ctx: HandlerContext, payload: { readonly target: number; readonly ability: string; readonly source: number | undefined }) {
      return performAttack(ctx, content, hooks, payload.source ?? playerEntity(ctx), payload.target, payload.ability)
    },
  }
  const buy = {
    run(ctx: HandlerContext, payload: { readonly vendor: string; readonly slot: number }) {
      const vendor = content.vendors.get(payload.vendor)
      if (vendor === undefined) return reject('unknown_vendor')
      const offer = vendor.stock[payload.slot]
      if (offer === undefined) return reject('missing_offer')
      const player = playerEntity(ctx)
      if (player === undefined) return reject('missing_inventory')
      const price = vendor.buy[offer.contentId]
      if (price === undefined || !Number.isInteger(price) || price < 0) return reject('invalid_price')
      const wallet = ctx.write(WalletState)
      const gold = wallet.gold[player] ?? 0
      if (gold < price) return reject('insufficient_gold')
      const def = content.items.get(offer.contentId)
      if (def === undefined) return reject('unknown_item')
      const max = def.maxStack ?? 1
      const inventory = readInventory(ctx, player)
      const slots = [...inventory.slots]
      let remaining = offer.quantity
      for (let index = 0; index < slots.length && remaining > 0; index += 1) {
        const existing = slots[index]
        if (existing === null || existing.contentId !== offer.contentId) continue
        const room = max - existing.quantity
        if (room > 0) {
          const moved = Math.min(room, remaining)
          slots[index] = { ...existing, quantity: existing.quantity + moved }
          remaining -= moved
        }
      }
      while (remaining > 0) {
        const empty = slots.findIndex((slot) => slot === null)
        if (empty < 0) return reject('inventory_full')
        const moved = Math.min(remaining, max)
        slots[empty] = {
          id: `${offer.contentId}#buy.${ctx.tick}.${payload.slot}.${empty}`,
          contentId: offer.contentId,
          quantity: moved,
          affixes: [],
        }
        remaining -= moved
      }
      writeInventory(ctx, player, { slots })
      wallet.gold[player] = gold - price
      return ok()
    },
  }
  const pickup = {
    run(ctx: HandlerContext, payload: { readonly ground: number }) {
      if (!ctx.has(payload.ground, GroundItem) || ctx.read(GroundItem).item[payload.ground] === '') return reject('missing_ground')
      const item = parseItemSnapshot(ctx.read(GroundItem).item[payload.ground])
      const player = playerEntity(ctx)
      if (player === undefined) return reject('missing_inventory')
      if (ctx.has(player, CombatDead) || (ctx.has(player, CombatHealth) && ctx.read(CombatHealth).current[player] <= 0)) return reject('dead')
      if (options.pickupRange !== undefined) {
        if (!ctx.has(player, ActorPosition) || !ctx.has(payload.ground, ActorPosition)) return reject('missing_position')
        const position = ctx.read(ActorPosition)
        const dx = position.x[player] - position.x[payload.ground]
        const dy = position.y[player] - position.y[payload.ground]
        if (dx * dx + dy * dy > options.pickupRange * options.pickupRange) return reject('out_of_range')
      }
      const inventory = readInventory(ctx, player)
      const def = content.items.get(item.contentId)
      const max = def?.maxStack ?? 1
      const slots = [...inventory.slots]
      let remaining = item.quantity
      for (let index = 0; index < slots.length && remaining > 0; index += 1) {
        const existing = slots[index]
        if (existing === null || existing.contentId !== item.contentId) continue
        const room = max - existing.quantity
        if (room > 0) {
          const moved = Math.min(room, remaining)
          slots[index] = { ...existing, quantity: existing.quantity + moved }
          remaining -= moved
        }
      }
      while (remaining > 0) {
        const empty = slots.findIndex((slot) => slot === null)
        if (empty < 0) return reject('inventory_full')
        const moved = Math.min(remaining, max)
        slots[empty] = { ...item, quantity: moved }
        remaining -= moved
      }
      writeInventory(ctx, player, { slots })
      ctx.write(GroundItem).item[payload.ground] = ''
      ctx.despawn(payload.ground)
      ctx.emit(ItemPicked, { entity: player, item: item.contentId })
      return ok()
    },
  }
  const sell = {
    run(ctx: HandlerContext, payload: { readonly vendor: string; readonly slot: number }) {
      const vendor = content.vendors.get(payload.vendor)
      if (vendor === undefined) return reject('unknown_vendor')
      const player = playerEntity(ctx)
      if (player === undefined) return reject('missing_inventory')
      const inventory = readInventory(ctx, player)
      const item = inventory.slots[payload.slot]
      if (item === undefined || item === null) return reject('missing_item')
      const price = vendor.sell[item.contentId]
      if (price === undefined || !Number.isInteger(price) || price < 0) return reject('invalid_price')
      const slots = [...inventory.slots]
      slots[payload.slot] = null
      writeInventory(ctx, player, { slots })
      ctx.write(WalletState).gold[player] += price * item.quantity
      return ok()
    },
  }
  const equip = {
    run(ctx: HandlerContext, payload: { readonly slot: number }) {
      const player = playerEntity(ctx)
      if (player === undefined) return reject('missing_inventory')
      const inventory = readInventory(ctx, player)
      const item = inventory.slots[payload.slot]
      if (item === undefined || item === null) return reject('missing_item')
      const def = content.items.get(item.contentId)
      if (def === undefined || def.slot === undefined) return reject('invalid_slot')
      if (hooks.canEquip !== undefined && !hooks.canEquip(def, def.slot)) return reject('cannot_equip')
      const equipment = readEquipment(ctx, player)
      const slots = [...inventory.slots]
      slots[payload.slot] = equipment.slots[def.slot] ?? null
      writeInventory(ctx, player, { slots })
      writeEquipment(ctx, player, { slots: { ...equipment.slots, [def.slot]: item } })
      return ok()
    },
  }
  const useItem = {
    run(ctx: HandlerContext, payload: { readonly slot: number }) {
      const player = playerEntity(ctx)
      if (player === undefined || !ctx.has(player, CombatHealth)) return reject('missing_player')
      const health = ctx.write(CombatHealth)
      if (ctx.has(player, CombatDead) || health.current[player] <= 0) return reject('dead')
      const inventory = readInventory(ctx, player)
      const item = inventory.slots[payload.slot]
      if (item === undefined || item === null) return reject('missing_item')
      const heal = content.items.get(item.contentId)?.heal
      if (heal === undefined || heal <= 0) return reject('not_consumable')
      if (health.current[player] >= health.max[player]) return reject('full_health')
      const slots = [...inventory.slots]
      slots[payload.slot] = item.quantity > 1 ? { ...item, quantity: item.quantity - 1 } : null
      writeInventory(ctx, player, { slots })
      health.current[player] = Math.min(health.max[player], health.current[player] + heal)
      return ok()
    },
  }
  const acceptQuest = {
    run(ctx: HandlerContext, payload: { readonly quest: string }) {
      const player = playerEntity(ctx)
      if (player === undefined) return reject('missing_player')
      const view = ctx.write(QuestLogSnapshot)
      const log = questLog(content, view.snapshot[player])
      if (!log.accept(payload.quest, ctx.tick)) return reject('unavailable')
      view.snapshot[player] = JSON.stringify(log.serialize())
      ctx.emit(QuestChanged, { quest: payload.quest, status: 'active' })
      return ok()
    },
  }
  const turnInQuest = {
    run(ctx: HandlerContext, payload: { readonly quest: string }) {
      const player = playerEntity(ctx)
      if (player === undefined) return reject('missing_player')
      const view = ctx.write(QuestLogSnapshot)
      const log = questLog(content, view.snapshot[player])
      const result = log.turnIn(payload.quest)
      if (!result.ok) return reject(result.reason ?? 'not_completed')
      hooks.onQuestReward?.(ctx, result.rewards)
      view.snapshot[player] = JSON.stringify(log.serialize())
      ctx.emit(QuestChanged, { quest: payload.quest, status: 'turnedIn' })
      return ok()
    },
  }
  const dialogueStart = {
    run(ctx: HandlerContext, payload: { readonly dialogue: string }) {
      const player = playerEntity(ctx)
      if (player === undefined) return reject('missing_player')
      const runner = dialogueRuntime(content, payload.dialogue, ctx.read(DialogueSnapshot).snapshot[player], ctx, hooks)
      const first = content.dialogues.get(payload.dialogue)?.nodes[0]
      if (first === undefined) return reject('empty_dialogue')
      const step = runner.start(first.id)
      if (!step.ok) return reject(step.reason ?? 'unavailable')
      saveDialogue(ctx, player, payload.dialogue, runner)
      if (step.view !== undefined) ctx.emit(DialogueChanged, { node: step.view.node.id })
      return ok()
    },
  }
  const dialogueChoose = {
    run(ctx: HandlerContext, payload: { readonly choice: string }) {
      const player = playerEntity(ctx)
      if (player === undefined) return reject('missing_player')
      const raw = ctx.read(DialogueSnapshot).snapshot[player]
      if (raw === undefined || raw === '') return reject('not_started')
      const saved = parseDialogueSave(raw)
      const runner = dialogueRuntime(content, saved.graph, raw, ctx, hooks)
      const step = runner.choose(payload.choice)
      if (!step.ok) return reject(step.reason ?? 'unavailable')
      saveDialogue(ctx, player, saved.graph, runner)
      if (step.view !== undefined) ctx.emit(DialogueChanged, { node: step.view.node.id })
      return ok()
    },
  }
  const applyStatus = {
    run(ctx: HandlerContext, payload: { readonly target: number; readonly status: string; readonly source: string; readonly stacks: number }) {
      const def = content.statuses.get(payload.status)
      if (def === undefined) return reject('unknown_status')
      if (!Number.isInteger(payload.stacks) || payload.stacks < 1) return reject('invalid_quantity')
      if (!ctx.has(payload.target, StatusState)) return reject('missing_status_state')
      const view = ctx.write(StatusState)
      const set = new StatusSet()
      const previous = view.snapshot[payload.target]
      if (previous !== undefined && previous !== '') {
        set.restore(parseStatusSnapshot(previous), content.statuses)
      }
      set.apply(def, payload.source, ctx.tick, payload.stacks)
      view.snapshot[payload.target] = JSON.stringify(set.serialize())
      return ok()
    },
  }
  const encounterStart = {
    run(ctx: HandlerContext, payload: { readonly encounter: string }) {
      const existing = parseEncounterSave(ctx.model(EncounterStateModel).snapshot)
      if (existing !== null) {
        return existing.encounter === payload.encounter ? ok() : reject('already_active')
      }
      const def = content.encounters.get(payload.encounter)
      if (def === undefined) return reject('unknown_encounter')
      const points = def.waves[0]?.spawnPoints ?? [{ x: 0, y: 0 }]
      const runtime = new EncounterRuntime({ def, rng: ctx.rng('encounter'), spawnPoints: points })
      const result = runtime.start()
      if (!result.ok) return reject(result.reason ?? 'spawn_failed')
      spawnEncounterActors(ctx, content, payload.encounter, result.spawned)
      ctx.mutModel(EncounterStateModel).spawnTick = ctx.tick
      ctx.emit(EncounterPhaseChanged, { encounter: payload.encounter, phase: runtime.phase ?? '' })
      ctx.mutModel(EncounterStateModel).snapshot = JSON.stringify({
        encounter: payload.encounter,
        runtime: runtime.serialize(),
      })
      return ok()
    },
  }
  const usePortal = {
    run(ctx: HandlerContext, payload: { readonly portal: string }) {
      const portal = content.portals.get(payload.portal)
      if (portal === undefined) return reject('unknown_portal')
      const current = parseZoneSnapshot(ctx.model(ZoneStateModel).snapshot)
      if (current === null || !content.zones.has(current)) return reject('unknown_zone')
      if (current !== portal.from && current !== portal.to) return reject('not_connected')
      const target = current === portal.to ? portal.from : portal.to
      ctx.mutModel(ZoneStateModel).snapshot = JSON.stringify({ zone: target })
      ctx.emit(ZoneChanged, { zone: target })
      return ok()
    },
  }
  return { spawn, move, attack, buy, sell, pickup, equip, useItem, acceptQuest, turnInQuest, dialogueStart, dialogueChoose, applyStatus, encounterStart, usePortal }
}
