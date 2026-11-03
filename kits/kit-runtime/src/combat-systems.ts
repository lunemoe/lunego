import { defineSystem } from '@lunego/core'
import { StatusSet } from '@lunego/kit-status'
import { resolveDamage } from '@lunego/kit-combat'
import { parseStatusSnapshot } from './state-bridge.js'
import type { RuntimeFeatureOptions } from './types.js'
import {
  StatusState, StatusPeriodic, DamageRequested, Damaged, Died, CombatHealth,
  CombatDefenses, CombatDead, ActorVelocity, ActorPosition, GroundItem, ItemDropped, ContentTag, CombatTeam,
} from './schema.js'

export function combatSystems(options: RuntimeFeatureOptions) {
  const { content, hooks = {} } = options
  const statusTick = defineSystem({
    name: `${options.name}.status.tick`,
    phase: 'pre',
    reads: [StatusState, CombatDead],
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
    reads: [CombatHealth, CombatDefenses, ActorVelocity, CombatDead],
    writes: [CombatHealth, CombatDead, CombatDefenses, ActorVelocity],
    emits: [Damaged, Died],
    listens: [DamageRequested],
    run(ctx) {
      const health = ctx.write(CombatHealth)
      for (const packet of ctx.events(DamageRequested)) {
        const target = packet.target
        if (!ctx.has(target, CombatHealth) || ctx.has(target, CombatDead) || health.current[target] <= 0) {
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
          shield: (ctx.has(target, CombatDefenses) ? defenses.shield[target] : 0),
          armor: (ctx.has(target, CombatDefenses) ? defenses.armor[target] : 0),
          dodge: (ctx.has(target, CombatDefenses) ? defenses.dodge[target] : 0),
          block: (ctx.has(target, CombatDefenses) ? defenses.block[target] : 0),
        })
        const result = entered ?? resolveDamage(
          { amount: packet.amount, type: packet.damageType },
          {
            health: health.current[target],
            shield: (ctx.has(target, CombatDefenses) ? defenses.shield[target] : 0),
            armor: (ctx.has(target, CombatDefenses) ? defenses.armor[target] : 0),
            dodgeChance: (ctx.has(target, CombatDefenses) ? defenses.dodge[target] : 0),
            blockChance: (ctx.has(target, CombatDefenses) ? defenses.block[target] : 0),
            resistances: Object.fromEntries((ctx.has(target, CombatDefenses) ? (defenses.resistances[target] ?? []) : []).map((entry) => [entry.type, entry.value])),
          },
          { rng: ctx.rng('combat') },
        )
        health.current[target] = result.health
        if (ctx.has(target, CombatDefenses)) ctx.write(CombatDefenses).shield[target] = result.shield
        if (result.dead) {
          ctx.add(target, CombatDead)
          if (ctx.has(target, ActorVelocity)) {
            ctx.write(ActorVelocity).x[target] = 0
            ctx.write(ActorVelocity).y[target] = 0
          }
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
    reads: [ActorPosition, ContentTag, CombatTeam, ...(options.hookReads ?? [])],
    writes: [GroundItem, ActorPosition],
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
        const position = ctx.read(ActorPosition)
        const entity = ctx.spawn({
          'runtime.actor.position': { x: position.x[event.target] ?? 0, y: position.y[event.target] ?? 0 },
          'runtime.items.ground': {
            item: JSON.stringify(item),
          },
        })
        ctx.emit(ItemDropped, { entity, item: item.contentId })
      }
    },
  })
  return [statusTick, combatResolve, lootDrop]
}
