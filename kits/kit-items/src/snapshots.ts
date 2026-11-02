import {
  ItemIdentity,
  lookupItemDef,
  maxStack,
  type ItemDefCatalog,
  type ItemIdentitySnapshot,
  type ItemInstance,
} from './items.js'

export interface InventorySnapshot {
  readonly version: 1
  readonly slots: readonly (ItemInstance | null)[]
  readonly identity: ItemIdentitySnapshot
}

export interface EquipmentSnapshot {
  readonly version: 1
  readonly items: Readonly<Record<string, ItemInstance>>
  readonly identity: ItemIdentitySnapshot
}

export function snapshotObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

export function validItem(value: unknown, label: string, catalog: ItemDefCatalog): ItemInstance {
  const item = snapshotObject(value, label)
  if (typeof item['id'] !== 'string' || item['id'].length === 0) {
    throw new Error(`${label}.id must be a non-empty string`)
  }
  if (typeof item['contentId'] !== 'string' || item['contentId'].length === 0) {
    throw new Error(`${label}.contentId must be a non-empty string`)
  }
  const def = lookupItemDef(catalog, item['contentId'])
  if (def === undefined) {
    throw new Error(`${label} references unknown item content ${item['contentId']}`)
  }
  const quantity = item['quantity']
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
    throw new Error(`${label}.quantity must be a positive integer`)
  }
  if (quantity > maxStack(def)) {
    throw new Error(`${label}.quantity ${quantity} exceeds maxStack ${maxStack(def)}`)
  }
  const rarity = item['rarity']
  if (rarity !== undefined && typeof rarity !== 'string') {
    throw new Error(`${label}.rarity must be a string`)
  }
  const affixes = item['affixes']
  if (!Array.isArray(affixes)) {
    throw new Error(`${label}.affixes must be an array`)
  }
  const sockets = item['sockets']
  if (def.sockets !== undefined) {
    if (!Array.isArray(sockets) || sockets.length !== def.sockets) {
      throw new Error(`${label}.sockets must have ${def.sockets} entries`)
    }
    if (sockets.some((slot) => slot !== null && typeof slot !== 'string')) {
      throw new Error(`${label}.sockets must contain strings or null`)
    }
  } else if (sockets !== undefined) {
    if (!Array.isArray(sockets) || sockets.some((slot) => slot !== null && typeof slot !== 'string')) {
      throw new Error(`${label}.sockets must contain strings or null`)
    }
  }
  const durability = item['durability']
  if (durability !== undefined && (typeof durability !== 'number' || !Number.isFinite(durability))) {
    throw new Error(`${label}.durability must be finite`)
  }
  return {
    id: item['id'],
    contentId: item['contentId'],
    quantity,
    affixes: affixes as ItemInstance['affixes'],
    ...(rarity === undefined ? {} : { rarity }),
    ...(sockets === undefined ? {} : { sockets: sockets as (string | null)[] }),
    ...(durability === undefined ? {} : { durability }),
  }
}

export function uniqueItemIds(items: readonly ItemInstance[]): void {
  const ids = new Set<string>()
  for (const item of items) {
    if (ids.has(item.id)) {
      throw new Error(`snapshot repeats item instance id ${item.id}`)
    }
    ids.add(item.id)
  }
}

export function validInventorySnapshot(
  value: unknown,
  capacity: number,
  catalog: ItemDefCatalog,
): { slots: readonly (ItemInstance | null)[]; identity: ItemIdentitySnapshot } {
  const snapshot = snapshotObject(value, 'inventory snapshot')
  if (snapshot['version'] !== 1) {
    throw new Error('inventory snapshot version must be 1')
  }
  if (!Array.isArray(snapshot['slots'])) {
    throw new Error('inventory snapshot slots must be an array')
  }
  if (snapshot['slots'].length > capacity) {
    throw new Error(`inventory snapshot has ${snapshot['slots'].length} slots for capacity ${capacity}`)
  }
  const slots = snapshot['slots'].map((slot, index) =>
    slot === null ? null : validItem(slot, `inventory slot ${index}`, catalog),
  )
  const items = slots.filter((slot): slot is ItemInstance => slot !== null)
  uniqueItemIds(items)
  const identity = ItemIdentity.fromJSON(snapshot['identity'])
  return { slots, identity: identity.toJSON() }
}
