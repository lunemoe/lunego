import type { RngStream } from '@lunego/core'
import {
  Inventory,
  type ItemFactory,
  lookupItemDef,
  type ContainerFailure,
  type ItemDefCatalog,
  type ItemInstance,
} from '@lunego/kit-items'
import type { QuestStatus } from '@lunego/kit-quest'

export interface CommerceWallet {
  gold: number
}

export type CommerceFailure = ContainerFailure | 'insufficient_gold' | 'invalid_price' | 'invalid_quantity' | 'invalid_recipe' | 'socket_full' | 'invalid_socket'

export type CommerceResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: CommerceFailure }

function fail<T>(reason: CommerceFailure): CommerceResult<T> {
  return { ok: false, reason }
}

function price(value: number): number | null {
  return Number.isFinite(value) && value >= 0 ? value : null
}

export interface VendorPrices {
  buy(contentId: string): number
  sell(contentId: string): number
  repair?(item: ItemInstance, amount: number): number
}

export interface VendorOffer {
  readonly requiredQuestStatus?: { readonly quest: string; readonly status: QuestStatus }
}

export interface VendorBuyOptions {
  readonly offer?: VendorOffer
  readonly questStatus?: (quest: string) => QuestStatus | null
  readonly quantity?: number
}

export class Vendor {
  readonly stock: Inventory
  readonly prices: VendorPrices

  constructor(options: { readonly stock: Inventory; readonly prices: VendorPrices }) {
    this.stock = options.stock
    this.prices = options.prices
  }

  /** Transfers stock to the buyer, then charges gold; failure leaves both untouched. */
  buy(
    buyer: Inventory,
    slot: number,
    wallet: CommerceWallet,
    options: VendorBuyOptions = {},
  ): CommerceResult<ItemInstance> {
    const item = this.stock.items[slot]
    if (item === undefined || item === null) {
      return fail('not_found')
    }
    const quantity = options.quantity ?? 1
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > item.quantity) {
      return fail('invalid_quantity')
    }
    if (
      options.offer?.requiredQuestStatus !== undefined &&
      (options.questStatus?.(options.offer.requiredQuestStatus.quest) ?? null) !== options.offer.requiredQuestStatus.status
    ) {
      return fail('cannot_equip')
    }
    const unit = price(this.prices.buy(item.contentId))
    if (unit === null) {
      return fail('invalid_price')
    }
    const total = unit * quantity
    if (wallet.gold < total) {
      return fail('insufficient_gold')
    }
    const transferred = this.stock.transfer(slot, buyer, quantity)
    if (!transferred.ok) {
      return transferred
    }
    wallet.gold -= total
    return { ok: true, value: { ...item, quantity } }
  }

  /** Transfers buyer item to stock, then pays gold. */
  sell(
    buyer: Inventory,
    slot: number,
    wallet: CommerceWallet,
    quantity = 1,
  ): CommerceResult<ItemInstance> {
    const item = buyer.items[slot]
    if (item === undefined || item === null) {
      return fail('not_found')
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > item.quantity) {
      return fail('invalid_quantity')
    }
    const unit = price(this.prices.sell(item.contentId))
    if (unit === null) {
      return fail('invalid_price')
    }
    const transferred = buyer.transfer(slot, this.stock, quantity)
    if (!transferred.ok) {
      return transferred
    }
    wallet.gold += unit * quantity
    return { ok: true, value: { ...item, quantity } }
  }

  /** Pure repair result; charges only after price is known. */
  repair(item: ItemInstance, amount: number, wallet: CommerceWallet): CommerceResult<ItemInstance> {
    if (!Number.isFinite(amount) || amount < 0) {
      return fail('invalid_quantity')
    }
    const unit = price(this.prices.repair?.(item, amount) ?? 0)
    if (unit === null) {
      return fail('invalid_price')
    }
    if (wallet.gold < unit) {
      return fail('insufficient_gold')
    }
    wallet.gold -= unit
    return { ok: true, value: { ...item, durability: Math.max(0, (item.durability ?? 0) + amount) } }
  }

  /** Respec callback is only charged after it succeeds. */
  respec(wallet: CommerceWallet, cost: number, respec: () => number): CommerceResult<number> {
    const unit = price(cost)
    if (unit === null) {
      return fail('invalid_price')
    }
    if (wallet.gold < unit) {
      return fail('insufficient_gold')
    }
    const refunded = respec()
    wallet.gold -= unit
    return { ok: true, value: refunded }
  }
}

export interface ItemRequirement {
  readonly contentId: string
  readonly quantity: number
}

export interface CraftRecipe {
  readonly id: string
  readonly inputs: readonly ItemRequirement[]
  readonly outputs: readonly ItemRequirement[]
  readonly conditions?: (context: CraftContext) => boolean
  /** Optional deterministic output generation using the injected RNG. */
  readonly createOutputs?: (rng: RngStream | undefined, factory: ItemFactory) => readonly ItemInstance[]
}

export interface CraftContext {
  readonly catalog: ItemDefCatalog
  readonly rng?: RngStream
}

export interface CraftOptions {
  readonly context?: CraftContext
  readonly rng?: RngStream
}

function cloneInventory(inventory: Inventory): Inventory {
  return Inventory.fromJSON({
    capacity: inventory.capacity,
    catalog: inventory.catalogForKit,
    snapshot: inventory.toJSON(),
    identity: inventory.identityForKit,
  })
}

function take(inventory: Inventory, requirement: ItemRequirement): boolean {
  let remaining = requirement.quantity
  if (!Number.isInteger(remaining) || remaining < 1) {
    return false
  }
  for (let index = 0; index < inventory.items.length && remaining > 0; index += 1) {
    const item = inventory.items[index]
    if (item === null || item.contentId !== requirement.contentId) {
      continue
    }
    const amount = Math.min(item.quantity, remaining)
    if (!inventory.remove(index, amount).ok) {
      return false
    }
    remaining -= amount
  }
  return remaining === 0
}

/** Validates against a clone, then commits; output creation is deterministic. */
export function craft(
  recipe: CraftRecipe,
  inventory: Inventory,
  factory: ItemFactory,
  options: CraftOptions = {},
): CommerceResult<readonly ItemInstance[]> {
  if (recipe.outputs.length === 0 && recipe.createOutputs === undefined) {
    return fail('invalid_recipe')
  }
  if (recipe.conditions !== undefined && !recipe.conditions({
    catalog: inventory.catalogForKit,
    ...(options.rng === undefined ? {} : { rng: options.rng }),
  })) {
    return fail('invalid_recipe')
  }
  const outputs: ItemInstance[] = recipe.createOutputs !== undefined
    ? [...recipe.createOutputs(options.rng, factory)]
    : []
  const clone = cloneInventory(inventory)
  for (const input of recipe.inputs) {
    if (!take(clone, input)) {
      return fail('not_found')
    }
  }
  if (outputs.length === 0) {
    for (const output of recipe.outputs) {
      const created = factory.create(output.contentId, { quantity: output.quantity })
      outputs.push(created)
    }
  }
  for (const output of outputs) {
    if (!clone.add(output).ok) {
      return fail('full')
    }
  }
  for (const input of recipe.inputs) {
    take(inventory, input)
  }
  for (const output of outputs) {
    inventory.add(output)
  }
  return { ok: true, value: outputs }
}

/** Socket a gem content id into one socket; original instance is not mutated. */
export function socketGem(
  item: ItemInstance,
  socketIndex: number,
  gemContentId: string,
  catalog: ItemDefCatalog,
): CommerceResult<ItemInstance> {
  if (lookupItemDef(catalog, gemContentId) === undefined) {
    return fail('not_found')
  }
  const sockets = item.sockets ?? []
  if (!Number.isInteger(socketIndex) || socketIndex < 0 || socketIndex >= sockets.length) {
    return fail('invalid_socket')
  }
  if (sockets[socketIndex] !== null) {
    return fail('socket_full')
  }
  const next = [...sockets]
  next[socketIndex] = gemContentId
  return { ok: true, value: { ...item, sockets: next } }
}
