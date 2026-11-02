import type { RngStream } from '@lunego/core'
import type { ThreatTable } from '@lunego/kit-ai'

export type DamageType = string

export interface DamagePacket {
  readonly amount: number
  readonly type: DamageType
  readonly source?: number | string
  readonly tags?: readonly string[]
}

export interface DamageTarget {
  readonly health: number
  readonly shield?: number
  readonly armor?: number
  readonly dodgeChance?: number
  readonly blockChance?: number
  readonly blockReduction?: number
  readonly resistances?: Readonly<Record<DamageType, number>>
  /** Resistance is clamped to [0, cap]; default 0.75. */
  readonly resistanceCap?: number
  /** Active control markers from kit-status (e.g. stun/root). */
  readonly controls?: readonly string[]
}

export interface DamageResult {
  readonly raw: number
  readonly dodged: boolean
  readonly blocked: boolean
  readonly afterDodge: number
  readonly afterBlock: number
  readonly afterArmor: number
  readonly afterResistance: number
  readonly absorbed: number
  readonly applied: number
  readonly health: number
  readonly shield: number
  readonly dead: boolean
}

export interface DamageOptions {
  readonly rng?: RngStream
}

function finiteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number`)
  }
  return value
}

function chance(value: number | undefined, label: string): number {
  if (value === undefined) {
    return 0
  }
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be within [0, 1]`)
  }
  return value
}

/**
 * Fixed damage pipeline: dodge → block → armor (flat) → resistance (capped)
 * → shield absorb → health/death. No target mutation; no global randomness.
 */
export function resolveDamage(
  packet: DamagePacket,
  target: DamageTarget,
  options: DamageOptions = {},
): DamageResult {
  const raw = finiteNonNegative(packet.amount, 'damage amount')
  const health = finiteNonNegative(target.health, 'target health')
  let shield = finiteNonNegative(target.shield ?? 0, 'target shield')
  const armor = finiteNonNegative(target.armor ?? 0, 'target armor')
  const dodgeChance = chance(target.dodgeChance, 'dodgeChance')
  const blockChance = chance(target.blockChance, 'blockChance')
  const blockReduction = chance(target.blockReduction, 'blockReduction')
  const resistanceCap = chance(target.resistanceCap ?? 0.75, 'resistanceCap')
  const resistance = Math.max(
    0,
    Math.min(resistanceCap, target.resistances?.[packet.type] ?? 0),
  )
  const needsRng = dodgeChance > 0 || blockChance > 0
  if (needsRng && options.rng === undefined) {
    throw new Error('damage mitigation with dodge/block requires an injected RngStream')
  }
  let amount = raw
  const dodged = dodgeChance > 0 ? options.rng?.chance(dodgeChance) ?? false : false
  if (dodged) {
    return {
      raw,
      dodged: true,
      blocked: false,
      afterDodge: 0,
      afterBlock: 0,
      afterArmor: 0,
      afterResistance: 0,
      absorbed: 0,
      applied: 0,
      health,
      shield,
      dead: false,
    }
  }
  const blocked = blockChance > 0 ? options.rng?.chance(blockChance) ?? false : false
  amount = blocked ? amount * (1 - blockReduction) : amount
  const afterBlock = amount
  amount = Math.max(0, amount - armor)
  const afterArmor = amount
  amount *= 1 - resistance
  const afterResistance = amount
  const absorbed = Math.min(shield, amount)
  shield -= absorbed
  amount -= absorbed
  const applied = amount
  const nextHealth = Math.max(0, health - applied)
  return {
    raw,
    dodged,
    blocked,
    afterDodge: raw,
    afterBlock,
    afterArmor,
    afterResistance,
    absorbed,
    applied,
    health: nextHealth,
    shield,
    dead: nextHealth <= 0,
  }
}

/** Add threat from a damage packet to an existing generic threat table. */
export function addDamageThreat(
  table: ThreatTable,
  source: number,
  amount: number,
): void {
  table.add(source, finiteNonNegative(amount, 'threat amount'))
}

export { ThreatTable } from '@lunego/kit-ai'
export type { ThreatEntry } from '@lunego/kit-ai'
