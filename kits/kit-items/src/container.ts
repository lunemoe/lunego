import {
  ItemFactory,
  ItemIdentity,
  lookupItemDef,
  maxStack,
  sameStack,
  type ItemDefCatalog,
  type ItemInstance,
} from './items.js'

export type ContainerFailure =
  | 'full'
  | 'not_found'
  | 'invalid_slot'
  | 'invalid_quantity'
  | 'stack_limit'
  | 'slot_mismatch'
  | 'cannot_equip'

export type ContainerResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: ContainerFailure }

function fail<T>(reason: ContainerFailure): ContainerResult<T> {
  return { ok: false, reason }
}

import {
  snapshotObject,
  uniqueItemIds,
  validInventorySnapshot,
  validItem,
  type EquipmentSnapshot,
  type InventorySnapshot,
} from './snapshots.js'

export type { EquipmentSnapshot, InventorySnapshot } from './snapshots.js'

/** Fixed-slot inventory/stash with atomic add/remove/move/split/merge/transfer. */
export class Inventory {
  readonly capacity: number
  protected readonly slots: (ItemInstance | null)[]
  protected readonly catalog: ItemDefCatalog
  protected readonly factory: ItemFactory
  readonly identity: ItemIdentity

  constructor(options: {
    readonly capacity: number
    readonly catalog: ItemDefCatalog
    readonly factory?: ItemFactory
    readonly identity?: ItemIdentity
    readonly slots?: readonly (ItemInstance | null)[]
  }) {
    if (!Number.isInteger(options.capacity) || options.capacity < 1) {
      throw new Error('inventory capacity must be a positive integer')
    }
    if (
      options.factory !== undefined &&
      options.identity !== undefined &&
      options.factory.identity !== options.identity
    ) {
      throw new Error('inventory factory and identity must share the same ItemIdentity')
    }
    this.capacity = options.capacity
    this.catalog = options.catalog
    this.identity = options.factory?.identity ?? options.identity ?? new ItemIdentity()
    this.factory = options.factory ?? new ItemFactory({ catalog: options.catalog, identity: this.identity })
    if (options.slots !== undefined && options.slots.length > options.capacity) {
      throw new Error('inventory slots exceed capacity')
    }
    this.slots = Array.from({ length: options.capacity }, (_, index) => options.slots?.[index] ?? null)
  }

  get items(): readonly (ItemInstance | null)[] {
    return [...this.slots]
  }

  get catalogForKit(): ItemDefCatalog {
    return this.catalog
  }

  get factoryForKit(): ItemFactory {
    return this.factory
  }

  get identityForKit(): ItemIdentity {
    return this.identity
  }

  get used(): number {
    return this.slots.filter((slot) => slot !== null).length
  }

  add(item: ItemInstance): ContainerResult<number> {
    const def = lookupItemDef(this.catalog, item.contentId)
    if (def === undefined) {
      return fail('not_found')
    }
    let quantity = item.quantity
    if (!Number.isInteger(quantity) || quantity < 1) {
      return fail('invalid_quantity')
    }
    const limit = maxStack(def)
    let firstIndex = -1
    const plan = this.slots.map((slot) => slot === null ? null : { ...slot })
    const target = plan
      .map((slot, index) => ({ slot, index }))
      .filter((entry) => entry.slot !== null && sameStack(entry.slot, item))
      .sort((left, right) => left.index - right.index)
    for (const entry of target) {
      if (quantity === 0) {
        break
      }
      const current = entry.slot as ItemInstance
      const space = limit - current.quantity
      if (space <= 0) {
        continue
      }
      const moved = Math.min(space, quantity)
      if (firstIndex < 0) {
        firstIndex = entry.index
      }
      plan[entry.index] = { ...current, quantity: current.quantity + moved }
      quantity -= moved
    }
    while (quantity > 0) {
      const empty = plan.findIndex((slot) => slot === null)
      if (empty < 0) {
        return fail('full')
      }
      const moved = Math.min(quantity, limit)
      if (firstIndex < 0) {
        firstIndex = empty
      }
      plan[empty] = { ...item, quantity: moved }
      quantity -= moved
    }
    for (let index = 0; index < plan.length; index += 1) {
      this.slots[index] = plan[index] ?? null
    }
    return { ok: true, value: firstIndex }
  }

  remove(index: number, quantity = 1): ContainerResult<ItemInstance> {
    const item = this.slots[index]
    if (item === undefined || item === null) {
      return fail('not_found')
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > item.quantity) {
      return fail('invalid_quantity')
    }
    if (quantity === item.quantity) {
      this.slots[index] = null
      return { ok: true, value: item }
    }
    const removed = { ...item, quantity }
    this.slots[index] = { ...item, quantity: item.quantity - quantity }
    return { ok: true, value: removed }
  }

  move(from: number, to: number): ContainerResult<void> {
    if (!this.valid(from) || !this.valid(to)) {
      return fail('invalid_slot')
    }
    const source = this.slots[from]
    if (source === null) {
      return fail('not_found')
    }
    const target = this.slots[to]
    if (target === null) {
      this.slots[to] = source
      this.slots[from] = null
      return { ok: true, value: undefined }
    }
    if (!sameStack(source, target)) {
      return fail('slot_mismatch')
    }
    const room = maxStack(lookupItemDef(this.catalog, target.contentId) ?? { id: target.contentId }) - target.quantity
    if (room <= 0) {
      return fail('stack_limit')
    }
    const moved = Math.min(room, source.quantity)
    this.slots[to] = { ...target, quantity: target.quantity + moved }
    this.slots[from] = source.quantity === moved ? null : { ...source, quantity: source.quantity - moved }
    return { ok: true, value: undefined }
  }

  merge(from: number, to: number): ContainerResult<void> {
    if (!this.valid(from) || !this.valid(to)) {
      return fail('invalid_slot')
    }
    if (this.slots[to] === null || this.slots[to] === undefined) {
      return fail('not_found')
    }
    return this.move(from, to)
  }

  split(index: number, quantity: number, targetIndex?: number): ContainerResult<ItemInstance> {
    const item = this.slots[index]
    if (item === undefined || item === null) {
      return fail('not_found')
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity >= item.quantity) {
      return fail('invalid_quantity')
    }
    const destination = targetIndex ?? this.slots.findIndex((slot) => slot === null)
    if (destination < 0 || destination === index || this.slots[destination] !== null) {
      return fail('full')
    }
    const split = { ...item, id: this.identity.nextSplitId(item.id), quantity }
    this.slots[destination] = split
    this.slots[index] = { ...item, quantity: item.quantity - quantity }
    return { ok: true, value: split }
  }

  transfer(index: number, target: Inventory, quantity = 1): ContainerResult<void> {
    const item = this.slots[index]
    if (item === undefined || item === null) {
      return fail('not_found')
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > item.quantity) {
      return fail('invalid_quantity')
    }
    const result = target.add({ ...item, quantity })
    if (!result.ok) {
      return result
    }
    this.slots[index] = item.quantity === quantity ? null : { ...item, quantity: item.quantity - quantity }
    return { ok: true, value: undefined }
  }

  find(id: string): number {
    return this.slots.findIndex((slot) => slot?.id === id)
  }

  toJSON(): InventorySnapshot {
    return {
      version: 1,
      slots: this.slots.map((slot) => slot === null ? null : { ...slot }),
      identity: this.identity.toJSON(),
    }
  }

  static fromJSON(options: {
    readonly capacity: number
    readonly catalog: ItemDefCatalog
    readonly snapshot: InventorySnapshot
    readonly identity?: ItemIdentity
    readonly factory?: ItemFactory
  }): Inventory {
    if (!Number.isInteger(options.capacity) || options.capacity < 1) {
      throw new Error('inventory capacity must be a positive integer')
    }
    const snapshot = validInventorySnapshot(options.snapshot, options.capacity, options.catalog)
    if (
      options.factory !== undefined &&
      options.identity !== undefined &&
      options.factory.identity !== options.identity
    ) {
      throw new Error('inventory factory and identity must share the same ItemIdentity')
    }
    const identity = options.factory?.identity ?? options.identity ?? ItemIdentity.fromJSON(snapshot.identity)
    identity.restoreAtLeast(snapshot.identity)
    return new Inventory({
      capacity: options.capacity,
      catalog: options.catalog,
      ...(options.factory === undefined ? {} : { factory: options.factory }),
      identity,
      slots: snapshot.slots,
    })
  }

  private valid(index: number): boolean {
    return Number.isInteger(index) && index >= 0 && index < this.capacity
  }
}

export class Stash extends Inventory {}

export interface EquipmentRules {
  /** Return true when the item content may occupy this caller-defined slot. */
  canEquip(def: { readonly id: string; readonly slot?: string }, slot: string): boolean
}

/** Equipment is a named-slot container; slot names/rules are caller-owned. */
export class Equipment {
  readonly slots: readonly string[]
  readonly identity: ItemIdentity
  private readonly items = new Map<string, ItemInstance>()
  private readonly catalog: ItemDefCatalog
  private readonly rules: EquipmentRules

  constructor(options: {
    readonly slots: readonly string[]
    readonly catalog: ItemDefCatalog
    readonly rules: EquipmentRules
    readonly identity?: ItemIdentity
  }) {
    this.slots = [...options.slots]
    this.catalog = options.catalog
    this.rules = options.rules
    this.identity = options.identity ?? new ItemIdentity()
  }

  get identityForKit(): ItemIdentity {
    return this.identity
  }

  equip(slot: string, item: ItemInstance): ContainerResult<void> {
    if (!this.slots.includes(slot)) {
      return fail('invalid_slot')
    }
    if (item.quantity !== 1) {
      return fail('invalid_quantity')
    }
    const def = lookupItemDef(this.catalog, item.contentId)
    if (def === undefined) {
      return fail('not_found')
    }
    if (!this.rules.canEquip(def, slot)) {
      return fail('cannot_equip')
    }
    if (this.items.has(slot)) {
      return fail('slot_mismatch')
    }
    this.items.set(slot, { ...item })
    return { ok: true, value: undefined }
  }

  unequip(slot: string): ContainerResult<ItemInstance> {
    const item = this.items.get(slot)
    if (item === undefined) {
      return fail('not_found')
    }
    this.items.delete(slot)
    return { ok: true, value: item }
  }

  get(slot: string): ItemInstance | null {
    return this.items.get(slot) ?? null
  }

  toJSON(): EquipmentSnapshot {
    return {
      version: 1,
      items: Object.fromEntries(
        [...this.items.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0),
      ),
      identity: this.identity.toJSON(),
    }
  }

  static fromJSON(options: {
    readonly slots: readonly string[]
    readonly catalog: ItemDefCatalog
    readonly rules: EquipmentRules
    readonly snapshot: EquipmentSnapshot
    readonly identity?: ItemIdentity
  }): Equipment {
    const snapshot = snapshotObject(options.snapshot, 'equipment snapshot')
    if (snapshot['version'] !== 1) {
      throw new Error('equipment snapshot version must be 1')
    }
    const items = snapshotObject(snapshot['items'], 'equipment snapshot items')
    const snapshotIdentity = ItemIdentity.fromJSON(snapshot['identity'])
    const identity = options.identity ?? snapshotIdentity
    identity.restoreAtLeast(snapshotIdentity.toJSON())
    const equipment = new Equipment({
      slots: options.slots,
      catalog: options.catalog,
      rules: options.rules,
      identity,
    })
    const equipped: ItemInstance[] = []
    for (const key of Object.keys(items)) {
      if (!options.slots.includes(key)) {
        throw new Error(`equipment snapshot references unknown slot ${key}`)
      }
      const item = validItem(items[key], `equipment slot ${key}`, options.catalog)
      if (item.quantity !== 1) {
        throw new Error(`equipment slot ${key} must contain one item`)
      }
      const def = lookupItemDef(options.catalog, item.contentId)
      if (def === undefined || !options.rules.canEquip(def, key)) {
        throw new Error(`invalid equipment snapshot at ${key}`)
      }
      equipped.push(item)
      equipment.items.set(key, { ...item })
    }
    uniqueItemIds(equipped)
    return equipment
  }
}
