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

export interface ItemFactoryOptions {
  readonly catalog: ItemDefCatalog
  readonly startId?: number
}

/** Deterministic item instance factory; ids are contentId#sequence. */
export class ItemFactory {
  private readonly catalog: ItemDefCatalog
  private nextId: number

  constructor(options: ItemFactoryOptions) {
    this.catalog = options.catalog
    this.nextId = options.startId ?? 1
  }

  get sequence(): number {
    return this.nextId
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
    const id = `${contentId}#${this.nextId}`
    this.nextId += 1
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
