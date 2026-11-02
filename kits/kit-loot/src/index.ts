import type { RngStream } from '@lunego/core'

export interface WeightedEntry<T> {
  readonly value: T
  readonly weight: number
}

export interface RarityDefinition {
  readonly id: string
  readonly weight: number
  readonly minAffixes: number
  readonly maxAffixes: number
}

export type ModifierMode = 'add' | 'mul'

export interface AffixRollSpec {
  readonly stat: string
  readonly mode: ModifierMode
  readonly min: number
  readonly max: number
  /** Roll a whole number instead of a float. */
  readonly integer?: boolean
}

export interface AffixDefinition {
  readonly id: string
  readonly weight: number
  /** Optional rarity-specific weights; omitted rarities fall back to weight. */
  readonly rarities?: Readonly<Record<string, number>>
  readonly rolls: readonly AffixRollSpec[]
}

export interface LootTable {
  readonly rarities: readonly RarityDefinition[]
  readonly affixes: readonly AffixDefinition[]
}

export interface RolledModifier {
  readonly stat: string
  readonly mode: ModifierMode
  readonly value: number
}

export interface RolledAffix {
  readonly affix: string
  readonly modifiers: readonly RolledModifier[]
}

export interface LootRoll {
  readonly rarity: string
  readonly affixes: readonly RolledAffix[]
}

function validateWeight(weight: number, label: string): void {
  if (!Number.isFinite(weight) || weight < 0) {
    throw new Error(`${label} weight must be a non-negative finite number`)
  }
}

/** Deterministic weighted pick; entry order is the tie-break document. */
export function weightedPick<T>(rng: RngStream, entries: readonly WeightedEntry<T>[]): T {
  let total = 0
  for (const entry of entries) {
    validateWeight(entry.weight, 'entry')
    total += entry.weight
  }
  if (total <= 0) {
    throw new Error('weightedPick needs at least one positive weight')
  }
  let roll = rng.float(0, total)
  for (const entry of entries) {
    if (entry.weight <= 0) {
      continue
    }
    if (roll < entry.weight) {
      return entry.value
    }
    roll -= entry.weight
  }
  const last = entries[entries.length - 1]
  if (last === undefined) {
    throw new Error('weightedPick received no entries')
  }
  return last.value
}

export function rollRarity(rng: RngStream, table: LootTable): RarityDefinition {
  return weightedPick(
    rng,
    table.rarities.map((rarity) => ({ value: rarity, weight: rarity.weight })),
  )
}

export function eligibleAffixes(table: LootTable, rarity: string): AffixDefinition[] {
  return table.affixes.filter((affix) => {
    const weight = affix.rarities?.[rarity] ?? affix.weight
    return Number.isFinite(weight) && weight > 0
  })
}

function rollAffix(rng: RngStream, affix: AffixDefinition): RolledAffix {
  const modifiers: RolledModifier[] = []
  for (const roll of affix.rolls) {
    if (!Number.isFinite(roll.min) || !Number.isFinite(roll.max) || roll.max < roll.min) {
      throw new Error(`affix ${affix.id} has invalid roll bounds for ${roll.stat}`)
    }
    if (roll.integer) {
      if (!Number.isSafeInteger(roll.min) || !Number.isSafeInteger(roll.max)) {
        throw new Error(`affix ${affix.id} integer roll bounds must be safe integers`)
      }
      modifiers.push({ stat: roll.stat, mode: roll.mode, value: rng.int(roll.min, roll.max) })
    } else {
      modifiers.push({ stat: roll.stat, mode: roll.mode, value: rng.float(roll.min, roll.max) })
    }
  }
  return { affix: affix.id, modifiers }
}

/**
 * Rolls rarity, affix count, affix picks and affix values in a fixed draw
 * order. Games compose these modifiers with their own item identity/slot.
 */
export function rollLoot(rng: RngStream, table: LootTable): LootRoll {
  const rarity = rollRarity(rng, table)
  if (rarity.minAffixes < 0 || rarity.maxAffixes < rarity.minAffixes) {
    throw new Error(`rarity ${rarity.id} has invalid affix counts`)
  }
  const count = rng.int(rarity.minAffixes, rarity.maxAffixes)
  const pool = eligibleAffixes(table, rarity.id)
  const affixes: RolledAffix[] = []
  for (let index = 0; index < count && pool.length > 0; index += 1) {
    const pick = weightedPick(
      rng,
      pool.map((affix) => ({
        value: affix,
        weight: affix.rarities?.[rarity.id] ?? affix.weight,
      })),
    )
    affixes.push(rollAffix(rng, pick))
    pool.splice(pool.indexOf(pick), 1)
  }
  return { rarity: rarity.id, affixes }
}
