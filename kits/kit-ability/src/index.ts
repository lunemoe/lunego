import { sqrt } from '@lunego/core/math'

export interface Point {
  readonly x: number
  readonly y: number
}

export interface ResourceCost {
  readonly resource: string
  readonly amount: number
}

export type TargetKind = 'none' | 'point' | 'direction' | 'nearest'

export interface TargetSpec {
  readonly kind: TargetKind
  /** Maximum distance for direction/nearest selection. */
  readonly range?: number
  /** Minimum normalized dot product for a direction cone (default -1). */
  readonly minDot?: number
}

export interface AbilityDefinition {
  readonly id: string
  /** Cooldown in whole ticks; 0 means usable every tick. */
  readonly cooldownTicks: number
  readonly costs?: readonly ResourceCost[]
  readonly target?: TargetSpec
}

export interface AbilityState {
  readonly cooldownUntilTick: number
}

export interface TargetCandidate {
  readonly id: number
  readonly x: number
  readonly y: number
}

export interface TargetQuery<T extends TargetCandidate> {
  readonly origin: Point
  readonly facing: Point
  /** Aim point for point-targeting; origin when omitted. */
  readonly aim?: Point
  readonly candidates: readonly T[]
}

export type Targeting<T extends TargetCandidate> =
  | { readonly kind: 'none' }
  | { readonly kind: 'point'; readonly x: number; readonly y: number }
  | {
      readonly kind: 'direction'
      readonly x: number
      readonly y: number
      readonly targets: readonly T[]
    }
  | { readonly kind: 'nearest'; readonly targets: readonly T[] }

export type CastFailure = 'cooldown' | 'resource'

export type CastCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: CastFailure }

export function defineAbility(definition: AbilityDefinition): AbilityDefinition {
  if (definition.id.length === 0) {
    throw new Error('ability id must not be empty')
  }
  if (!Number.isInteger(definition.cooldownTicks) || definition.cooldownTicks < 0) {
    throw new Error(`ability ${definition.id} cooldownTicks must be a non-negative integer`)
  }
  for (const cost of definition.costs ?? []) {
    if (cost.resource.length === 0 || !Number.isFinite(cost.amount) || cost.amount < 0) {
      throw new Error(`ability ${definition.id} has an invalid resource cost`)
    }
  }
  if (definition.target?.range !== undefined && definition.target.range < 0) {
    throw new Error(`ability ${definition.id} target range must be non-negative`)
  }
  return definition
}

export function readyAt(definition: AbilityDefinition, tick: number): AbilityState {
  return { cooldownUntilTick: tick + definition.cooldownTicks }
}

export function remainingCooldown(state: AbilityState, tick: number): number {
  return Math.max(0, state.cooldownUntilTick - tick)
}

export function isReady(state: AbilityState, tick: number): boolean {
  return state.cooldownUntilTick <= tick
}

/** Cooldown and resource gate. Target selection is a separate read-only step. */
export function checkCast(
  definition: AbilityDefinition,
  state: AbilityState,
  tick: number,
  resources: Readonly<Record<string, number>>,
): CastCheck {
  if (!isReady(state, tick)) {
    return { ok: false, reason: 'cooldown' }
  }
  for (const cost of definition.costs ?? []) {
    if ((resources[cost.resource] ?? 0) < cost.amount) {
      return { ok: false, reason: 'resource' }
    }
  }
  return { ok: true }
}

export function normalize(point: Point): Point {
  const length = sqrt(point.x * point.x + point.y * point.y)
  if (length === 0) {
    return { x: 1, y: 0 }
  }
  return { x: point.x / length, y: point.y / length }
}

export function targetsInCone<T extends TargetCandidate>(
  query: TargetQuery<T>,
  range: number,
  minDot = -1,
): T[] {
  const facing = normalize(query.facing)
  const rangeSq = range * range
  return query.candidates
    .map((candidate) => {
      const dx = candidate.x - query.origin.x
      const dy = candidate.y - query.origin.y
      return { candidate, dx, dy, distanceSq: dx * dx + dy * dy }
    })
    .filter((entry) => {
      if (entry.distanceSq > rangeSq) {
        return false
      }
      if (entry.distanceSq === 0) {
        return true
      }
      return (entry.dx * facing.x + entry.dy * facing.y) / sqrt(entry.distanceSq) >= minDot
    })
    .sort(
      (left, right) =>
        left.distanceSq - right.distanceSq || left.candidate.id - right.candidate.id,
    )
    .map((entry) => entry.candidate)
}

export function nearestTargets<T extends TargetCandidate>(
  query: TargetQuery<T>,
  range: number,
  limit = 1,
): T[] {
  const rangeSq = range * range
  return query.candidates
    .map((candidate) => {
      const dx = candidate.x - query.origin.x
      const dy = candidate.y - query.origin.y
      return { candidate, distanceSq: dx * dx + dy * dy }
    })
    .filter((entry) => entry.distanceSq <= rangeSq)
    .sort(
      (left, right) =>
        left.distanceSq - right.distanceSq || left.candidate.id - right.candidate.id,
    )
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.candidate)
}

/** Resolve a target description without mutating state or applying effects. */
export function resolveTargeting<T extends TargetCandidate>(
  spec: TargetSpec | undefined,
  query: TargetQuery<T>,
): Targeting<T> {
  if (spec === undefined || spec.kind === 'none') {
    return { kind: 'none' }
  }
  if (spec.kind === 'point') {
    const point = query.aim ?? query.origin
    return { kind: 'point', x: point.x, y: point.y }
  }
  if (spec.kind === 'direction') {
    const facing = normalize(query.facing)
    const range = spec.range ?? Number.POSITIVE_INFINITY
    return {
      kind: 'direction',
      x: facing.x,
      y: facing.y,
      targets: Number.isFinite(range)
        ? targetsInCone(query, range, spec.minDot)
        : targetsInCone(query, Number.MAX_SAFE_INTEGER, spec.minDot),
    }
  }
  return {
    kind: 'nearest',
    targets: Number.isFinite(spec.range ?? Number.POSITIVE_INFINITY)
      ? nearestTargets(query, spec.range ?? 0)
      : nearestTargets(query, Number.MAX_SAFE_INTEGER),
  }
}
