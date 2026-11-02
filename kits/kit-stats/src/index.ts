export interface StatDefinition {
  readonly id: string
  readonly base: number
  readonly min?: number
  readonly max?: number
}

export type ModifierMode = 'add' | 'mul'

export interface StatModifier {
  readonly stat: string
  readonly mode: ModifierMode
  readonly value: number
  readonly source?: string
}

export interface AffixDefinition {
  readonly id: string
  readonly modifiers: readonly StatModifier[]
}

export interface AffixInstance {
  readonly affix: string
  readonly modifiers: readonly StatModifier[]
}

function clamp(value: number, min: number | undefined, max: number | undefined): number {
  let result = value
  if (min !== undefined && result < min) {
    result = min
  }
  if (max !== undefined && result > max) {
    result = max
  }
  return result
}

/** Base + additive modifiers, then multiplicative modifiers, then clamped. */
export function aggregateStats(
  definitions: readonly StatDefinition[],
  modifiers: readonly StatModifier[],
  bases: Readonly<Record<string, number>> = {},
): Record<string, number> {
  const known = new Set(definitions.map((definition) => definition.id))
  for (const modifier of modifiers) {
    if (!known.has(modifier.stat)) {
      throw new Error(`unknown stat ${modifier.stat}`)
    }
  }
  const result: Record<string, number> = {}
  for (const definition of definitions) {
    const added = modifiers
      .filter((modifier) => modifier.stat === definition.id && modifier.mode === 'add')
      .reduce((total, modifier) => total + modifier.value, 0)
    const multiplied = modifiers
      .filter((modifier) => modifier.stat === definition.id && modifier.mode === 'mul')
      .reduce((total, modifier) => total * (1 + modifier.value), 1)
    const base = bases[definition.id] ?? definition.base
    result[definition.id] = clamp((base + added) * multiplied, definition.min, definition.max)
  }
  return result
}

export function aggregateAffixes(
  definitions: readonly StatDefinition[],
  affixes: readonly AffixInstance[],
  bases: Readonly<Record<string, number>> = {},
): Record<string, number> {
  const modifiers: StatModifier[] = []
  for (const affix of affixes) {
    for (const modifier of affix.modifiers) {
      modifiers.push({ ...modifier, source: modifier.source ?? affix.affix })
    }
  }
  return aggregateStats(definitions, modifiers, bases)
}

/** Mutable stat sheet for one actor/item; values are always recomputed. */
export class StatBlock {
  private readonly definitions: ReadonlyMap<string, StatDefinition>
  private readonly bases = new Map<string, number>()
  private modifiers: StatModifier[] = []

  constructor(definitions: readonly StatDefinition[], bases: Readonly<Record<string, number>> = {}) {
    this.definitions = new Map(definitions.map((definition) => [definition.id, definition]))
    for (const definition of definitions) {
      this.bases.set(definition.id, bases[definition.id] ?? definition.base)
    }
  }

  setBase(stat: string, value: number): void {
    this.require(stat)
    this.bases.set(stat, value)
  }

  add(modifier: StatModifier, source = modifier.source ?? 'default'): void {
    this.require(modifier.stat)
    if (!Number.isFinite(modifier.value)) {
      throw new Error(`modifier for ${modifier.stat} must be finite`)
    }
    this.modifiers.push({ ...modifier, source })
  }

  addAffix(affix: AffixInstance, source = affix.affix): void {
    for (const modifier of affix.modifiers) {
      this.add(modifier, modifier.source ?? source)
    }
  }

  removeSource(source: string): void {
    this.modifiers = this.modifiers.filter((modifier) => modifier.source !== source)
  }

  clearModifiers(): void {
    this.modifiers = []
  }

  value(stat: string): number {
    const definition = this.require(stat)
    return aggregateStats(
      [definition],
      this.modifiers.filter((modifier) => modifier.stat === stat),
      { [stat]: this.bases.get(stat) ?? definition.base },
    )[stat]
  }

  snapshot(): Record<string, number> {
    return aggregateStats(
      [...this.definitions.values()],
      this.modifiers,
      Object.fromEntries(this.bases),
    )
  }

  private require(stat: string): StatDefinition {
    const definition = this.definitions.get(stat)
    if (definition === undefined) {
      throw new Error(`unknown stat ${stat}`)
    }
    return definition
  }
}
