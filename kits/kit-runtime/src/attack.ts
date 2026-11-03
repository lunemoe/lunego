import { ok, reject, type HandlerContext } from '@lunego/core'
import { checkCast, readyAt, targetsInCone } from '@lunego/kit-ability'
import type { RuntimeContent } from './content.js'
import type { RuntimeHooks } from './types.js'
import {
  AbilityCooldowns, AbilityUsed, ActorFacing, ActorPosition, CombatDead,
  CombatHealth, CombatTeam, DamageRequested,
} from './schema.js'

/** Shared ability gate for player commands and autonomous actors. */
export function performAttack(
  ctx: HandlerContext, content: RuntimeContent, hooks: RuntimeHooks,
  source: number | undefined, target: number, abilityId: string,
) {
  if (!ctx.has(target, CombatHealth) || ctx.has(target, CombatDead) || ctx.read(CombatHealth).current[target] <= 0) {
    return reject('invalid_target')
  }
  if (source === undefined || source <= 0 || source === target ||
    !ctx.has(source, CombatHealth) || ctx.has(source, CombatDead) ||
    ctx.read(CombatHealth).current[source] <= 0 ||
    !ctx.has(source, CombatTeam) || !ctx.has(target, CombatTeam)) return reject('invalid_source')
  if (ctx.read(CombatTeam).side[source] === ctx.read(CombatTeam).side[target]) return reject('invalid_target')
  const def = content.abilities.get(abilityId)
  if (def === undefined) return reject('unknown_ability')
  const spec = def.ability.target
  if (spec?.range !== undefined) {
    if (!ctx.has(source, ActorPosition) || !ctx.has(target, ActorPosition)) return reject('missing_position')
    const position = ctx.read(ActorPosition)
    const facing = ctx.read(ActorFacing)
    const selected = targetsInCone({
      origin: { x: position.x[source], y: position.y[source] },
      facing: { x: facing.x[source] ?? 1, y: facing.y[source] ?? 0 },
      candidates: [{ id: target, x: position.x[target], y: position.y[target] }],
    }, spec.range, spec.kind === 'direction' ? spec.minDot : -1)
    if (selected.length === 0) return reject('out_of_range')
  }
  if (hooks.hasLineOfSight?.(ctx, source, target) === false) return reject('blocked')
  const cooldowns = ctx.model(AbilityCooldowns).entries
  const previous = cooldowns.find((entry) => entry.entity === source && entry.ability === abilityId)
  const check = checkCast(def.ability, { cooldownUntilTick: previous?.untilTick ?? 0 }, ctx.tick, {})
  if (!check.ok) return reject(check.reason)
  const damage = hooks.attackDamage === undefined ? def.damage : hooks.attackDamage(ctx, source, target, abilityId)
  if (damage === null || damage === undefined) return reject('unavailable')
  const untilTick = readyAt(def.ability, ctx.tick).cooldownUntilTick
  ctx.mutModel(AbilityCooldowns).entries = [
    ...cooldowns.filter((entry) => entry.untilTick > ctx.tick && !(entry.entity === source && entry.ability === abilityId)),
    { entity: source, ability: abilityId, untilTick },
  ]
  const targets = [target]
  if (def.areaRadius !== undefined && ctx.has(target, ActorPosition)) {
    const positions = ctx.read(ActorPosition)
    for (const candidate of ctx.query(CombatHealth, CombatTeam, ActorPosition)) {
      if (candidate === target || ctx.has(candidate, CombatDead) || ctx.read(CombatHealth).current[candidate] <= 0 ||
        ctx.read(CombatTeam).side[candidate] === ctx.read(CombatTeam).side[source] ||
        hooks.hasLineOfSight?.(ctx, source, candidate) === false) continue
      const dx = positions.x[candidate] - positions.x[target]
      const dy = positions.y[candidate] - positions.y[target]
      if (dx * dx + dy * dy <= def.areaRadius * def.areaRadius) targets.push(candidate)
    }
  }
  for (const victim of targets) {
    const packet = victim === target || hooks.attackDamage === undefined ? damage : hooks.attackDamage(ctx, source, victim, abilityId)
    if (packet !== null) ctx.emit(DamageRequested, { target: victim, source, amount: packet.amount, damageType: packet.type })
  }
  ctx.emit(AbilityUsed, { source, target, ability: abilityId })
  return ok()
}
