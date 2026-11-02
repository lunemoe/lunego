import type { RolledAffix } from '@lunego/kit-loot'
import type { AffixInstance, StatModifier } from '@lunego/kit-stats'

export interface ItemDef {
  readonly id: string
  /** Caller-owned slot name; kits do not define equipment slots. */
  readonly slot?: string
  readonly tags?: readonly string[]
  readonly maxStack?: number
  readonly sockets?: number
}

export interface ItemInstance {
  /** Stable instance id, independent from content id. */
  readonly id: string
  readonly contentId: string
  readonly quantity: number
  readonly rarity?: string
  readonly affixes: readonly RolledAffix[]
  readonly sockets?: readonly (string | null)[]
  readonly durability?: number
}

export type ItemDefCatalog = Readonly<Record<string, ItemDef>> | ReadonlyMap<string, ItemDef>

export function lookupItemDef(catalog: ItemDefCatalog, contentId: string): ItemDef | undefined {
  if (catalog instanceof Map) {
    return (catalog as ReadonlyMap<string, ItemDef>).get(contentId)
  }
  return (catalog as Readonly<Record<string, ItemDef>>)[contentId]
}

export interface ItemIdentitySnapshot {
  readonly version: 1
  /** Next ItemInstance sequence; ids are `contentId#sequence`. */
  readonly sequence: number
  /** Next split sequence; split ids are `itemId.split.sequence`. */
  readonly splitSequence: number
}

export interface ItemIdentityOptions {
  readonly sequence?: number
  readonly splitSequence?: number
}

function counter(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`)
  }
  return value
}

function identitySnapshot(value: unknown): ItemIdentitySnapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('item identity snapshot must be an object')
  }
  const record = value as Record<string, unknown>
  if (record['version'] !== 1) {
    throw new Error('item identity snapshot version must be 1')
  }
  return {
    version: 1,
    sequence: counter(record['sequence'], 'item identity sequence'),
    splitSequence: counter(record['splitSequence'], 'item identity splitSequence'),
  }
}

/**
 * Caller-owned identity allocator. Hold one instance for every inventory,
 * equipment set, stash and ground-drop list so ids stay globally unique.
 */
export class ItemIdentity {
  private nextSequence: number
  private nextSplitSequence: number

  constructor(options: ItemIdentityOptions = {}) {
    this.nextSequence = counter(options.sequence ?? 1, 'item identity sequence')
    this.nextSplitSequence = counter(options.splitSequence ?? 1, 'item identity splitSequence')
  }

  get sequence(): number {
    return this.nextSequence
  }

  get splitSequence(): number {
    return this.nextSplitSequence
  }

  nextItemId(contentId: string): string {
    if (contentId.length === 0) {
      throw new Error('item content id must not be empty')
    }
    const id = `${contentId}#${this.nextSequence}`
    this.nextSequence += 1
    return id
  }

  nextSplitId(itemId: string): string {
    if (itemId.length === 0) {
      throw new Error('item instance id must not be empty')
    }
    const id = `${itemId}.split.${this.nextSplitSequence}`
    this.nextSplitSequence += 1
    return id
  }

  /** Raises counters to at least a saved snapshot; never lowers them. */
  restoreAtLeast(snapshot: ItemIdentitySnapshot): void {
    const parsed = identitySnapshot(snapshot)
    this.nextSequence = Math.max(this.nextSequence, parsed.sequence)
    this.nextSplitSequence = Math.max(this.nextSplitSequence, parsed.splitSequence)
  }

  toJSON(): ItemIdentitySnapshot {
    return {
      version: 1,
      sequence: this.nextSequence,
      splitSequence: this.nextSplitSequence,
    }
  }

  static fromJSON(value: unknown): ItemIdentity {
    const parsed = identitySnapshot(value)
    return new ItemIdentity({ sequence: parsed.sequence, splitSequence: parsed.splitSequence })
  }
}

export interface ItemFactoryOptions {
  readonly catalog: ItemDefCatalog
  /** Legacy shorthand for `identity.sequence`; not a new allocator. */
  readonly startId?: number
  readonly identity?: ItemIdentity
}

/** Deterministic item instance factory; ids are contentId#sequence. */
export class ItemFactory {
  private readonly catalog: ItemDefCatalog
  private readonly identityValue: ItemIdentity

  constructor(options: ItemFactoryOptions) {
    if (options.identity !== undefined && options.startId !== undefined) {
      throw new Error('ItemFactory accepts either identity or startId, not both')
    }
    this.catalog = options.catalog
    this.identityValue = options.identity ?? new ItemIdentity({ sequence: options.startId ?? 1 })
  }

  get identity(): ItemIdentity {
    return this.identityValue
  }

  get sequence(): number {
    return this.identityValue.sequence
  }

  create(
    contentId: string,
    options: {
      readonly quantity?: number
      readonly rarity?: string
      readonly affixes?: readonly RolledAffix[]
      readonly sockets?: readonly (string | null)[]
      readonly durability?: number
    } = {},
  ): ItemInstance {
    const def = lookupItemDef(this.catalog, contentId)
    if (def === undefined) {
      throw new Error(`unknown item content ${contentId}`)
    }
    const quantity = options.quantity ?? 1
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error('item quantity must be a positive integer')
    }
    const sockets = options.sockets ?? (
      def.sockets === undefined
        ? undefined
        : Array.from({ length: def.sockets }, () => null)
    )
    if (sockets !== undefined && sockets.length !== (def.sockets ?? sockets.length)) {
      throw new Error(`item ${contentId} socket count mismatch`)
    }
    const id = this.identityValue.nextItemId(contentId)
    return {
      id,
      contentId,
      quantity,
      ...(options.rarity === undefined ? {} : { rarity: options.rarity }),
      affixes: options.affixes ?? [],
      ...(sockets === undefined ? {} : { sockets }),
      ...(options.durability === undefined ? {} : { durability: options.durability }),
    }
  }

  toJSON(): ItemIdentitySnapshot {
    return this.identityValue.toJSON()
  }

  static fromJSON(value: unknown, options: { readonly catalog: ItemDefCatalog }): ItemFactory {
    return new ItemFactory({ catalog: options.catalog, identity: ItemIdentity.fromJSON(value) })
  }
}

export function maxStack(def: ItemDef): number {
  return def.maxStack ?? 1
}

export function sameStack(left: ItemInstance, right: ItemInstance): boolean {
  return left.contentId === right.contentId &&
    left.rarity === right.rarity &&
    JSON.stringify(left.affixes) === JSON.stringify(right.affixes) &&
    JSON.stringify(left.sockets ?? []) === JSON.stringify(right.sockets ?? []) &&
    left.durability === right.durability
}

/** Maps rolled affixes to kit-stats modifiers without inventing item values. */
export function itemModifiers(instance: ItemInstance): StatModifier[] {
  return instance.affixes.flatMap((affix) =>
    affix.modifiers.map((modifier) => ({
      ...modifier,
      source: `item:${instance.id}:${affix.affix}`,
    })),
  )
}

export function itemAffixInstances(instance: ItemInstance): AffixInstance[] {
  return instance.affixes.map((affix) => ({ affix: affix.affix, modifiers: affix.modifiers }))
}
