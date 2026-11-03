import { defineSystem } from '@lunego/core'
import { Perception } from '@lunego/kit-ai'
import { performAttack } from './attack.js'
import { parseZoneSnapshot } from './state-bridge.js'
import type { RuntimeFeatureOptions } from './types.js'
import {
  AbilityCooldowns, AbilityUsed, ActorPosition, ActorVelocity, ActorFacing,
  AiState, CombatTeam, CombatDead, CombatHealth, DamageRequested, ZoneStateModel, EquipmentState,
} from './schema.js'

export function actorSystems(options: RuntimeFeatureOptions) {
  const { content, hooks = {} } = options
  const integrate = defineSystem({
    name: `${options.name}.actor.integrate`,
    phase: 'update',
    reads: [ActorVelocity, CombatDead, CombatHealth, ZoneStateModel],
    writes: [ActorPosition, ActorVelocity],
    run(ctx) {
      const position = ctx.write(ActorPosition)
      const velocity = ctx.write(ActorVelocity)
      const zoneId = parseZoneSnapshot(ctx.model(ZoneStateModel).snapshot)
      const bounds = zoneId === null ? undefined : content.zones.get(zoneId)?.bounds
      for (const entity of ctx.query(ActorPosition, ActorVelocity)) {
        if (ctx.has(entity, CombatDead) || (ctx.has(entity, CombatHealth) && ctx.read(CombatHealth).current[entity] <= 0)) {
          velocity.x[entity] = 0
          velocity.y[entity] = 0
          continue
        }
        position.x[entity] += velocity.x[entity] * ctx.time.dt
        position.y[entity] += velocity.y[entity] * ctx.time.dt
        if (bounds !== undefined) {
          position.x[entity] = Math.max(bounds.x, Math.min(bounds.x + bounds.width, position.x[entity]))
          position.y[entity] = Math.max(bounds.y, Math.min(bounds.y + bounds.height, position.y[entity]))
        }
      }
    },
  })
  const aiThink = defineSystem({
    name: `${options.name}.ai.think`,
    phase: 'pre',
    reads: [AiState, ActorPosition, ActorFacing, ActorVelocity, CombatTeam, CombatDead, CombatHealth, AbilityCooldowns, EquipmentState, ...(options.hookReads ?? [])],
    writes: [AiState, ActorVelocity, ActorFacing, AbilityCooldowns],
    emits: [DamageRequested, AbilityUsed],
    run(ctx) {
      const position = ctx.read(ActorPosition)
      const team = ctx.read(CombatTeam)
      const velocity = ctx.write(ActorVelocity)
      const facing = ctx.write(ActorFacing)
      const aiView = ctx.write(AiState)
      for (const entity of ctx.query(AiState, ActorPosition)) {
        if (ctx.has(entity, CombatDead) || (ctx.has(entity, CombatHealth) && ctx.read(CombatHealth).current[entity] <= 0)) {
          velocity.x[entity] = 0
          velocity.y[entity] = 0
          aiView.target[entity] = 0
          continue
        }
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
            !ctx.has(candidate, CombatDead) && ctx.has(candidate, CombatHealth) && ctx.read(CombatHealth).current[candidate] > 0 &&
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
          const result = performAttack(ctx, content, hooks, entity, nearest, ability)
          if (result.status === 'ok') aiView.lastAttackTick[entity] = ctx.tick
        }
      }
    },
  })
  return [aiThink, integrate]
}
