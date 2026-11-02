import { describe, expect, it } from 'vitest'
import type { RngStream } from '@lunego/core'
import { Inventory, ItemFactory, type ItemDefCatalog } from '@lunego/kit-items'
import { Vendor, craft, socketGem, type CommerceWallet } from '../index.js'

const catalog: ItemDefCatalog = {
  potion: { id: 'potion', maxStack: 10 },
  herb: { id: 'herb', maxStack: 10 },
  sword: { id: 'sword', slot: 'weapon', maxStack: 1, sockets: 1 },
  gem: { id: 'gem', maxStack: 10 },
}

function rng(): RngStream {
  return {
    next: () => 0,
    uint32: () => 0,
    int: (min) => min,
    float: (min) => min,
    chance: () => false,
    pick: (items) => items[0] as never,
  }
}

describe('vendor commerce', () => {
  it('buys/sells atomically and preserves state on failures', () => {
    const factory = new ItemFactory({ catalog })
    const stock = new Inventory({ capacity: 2, catalog })
    stock.add(factory.create('potion', { quantity: 5 }))
    const buyer = new Inventory({ capacity: 1, catalog })
    const vendor = new Vendor({ stock, prices: { buy: () => 10, sell: () => 4 } })
    const wallet: CommerceWallet = { gold: 100 }
    expect(vendor.buy(buyer, 0, wallet, { quantity: 2 }).ok).toBe(true)
    expect(wallet.gold).toBe(80)
    expect(buyer.items[0]?.quantity).toBe(2)
    expect(stock.items[0]?.quantity).toBe(3)

    {
      const fullBuyer = new Inventory({ capacity: 1, catalog })
      fullBuyer.add(factory.create('sword'))
      const beforeStock = stock.items[0]?.quantity
      const beforeGold = wallet.gold
      expect(vendor.buy(fullBuyer, 0, wallet).reason).toBe('full')
      expect(wallet.gold).toBe(beforeGold)
      expect(stock.items[0]?.quantity).toBe(beforeStock)
    }

    expect(vendor.sell(buyer, 0, wallet, 2).ok).toBe(true)
    expect(wallet.gold).toBe(88)
    expect(stock.items[0]?.quantity).toBe(5)
    const poor: CommerceWallet = { gold: 0 }
    expect(vendor.buy(new Inventory({ capacity: 1, catalog }), 0, poor).reason).toBe('insufficient_gold')
  })

  it('repairs/respecs only after payment validation', () => {
    const stock = new Inventory({ capacity: 1, catalog })
    const vendor = new Vendor({ stock, prices: { buy: () => 1, sell: () => 1, repair: () => 7 } })
    const wallet: CommerceWallet = { gold: 10 }
    const item = new ItemFactory({ catalog }).create('sword', { durability: 2 })
    const repaired = vendor.repair(item, 3, wallet)
    expect(repaired.ok).toBe(true)
    expect(wallet.gold).toBe(3)
    expect(repaired.ok && repaired.value.durability).toBe(5)
    expect(vendor.repair(item, 0, { gold: 0 }).reason).toBe('insufficient_gold')

    let called = 0
    const respec = vendor.respec(wallet, 2, () => { called += 1; return 4 })
    expect(respec).toEqual({ ok: true, value: 4 })
    expect(called).toBe(1)
    expect(wallet.gold).toBe(1)
    expect(vendor.respec(wallet, 2, () => 9).reason).toBe('insufficient_gold')
    expect(called).toBe(1)
  })

  it('crafts atomically and supports deterministic RNG/output', () => {
    const factory = new ItemFactory({ catalog })
    const inventory = new Inventory({ capacity: 2, catalog, factory })
    inventory.add(factory.create('herb', { quantity: 2 }))
    const recipe = {
      id: 'potion',
      inputs: [{ contentId: 'herb', quantity: 2 }],
      outputs: [{ contentId: 'potion', quantity: 1 }],
    }
    const result = craft(recipe, inventory, factory)
    expect(result.ok).toBe(true)
    expect(inventory.items[0]?.contentId).toBe('potion')
    expect(inventory.items[1]).toBeNull()

    const missing = new Inventory({ capacity: 1, catalog })
    expect(craft(recipe, missing, factory).reason).toBe('not_found')
    expect(missing.items[0]).toBeNull()

    const full = new Inventory({ capacity: 1, catalog })
    full.add(factory.create('sword'))
    const fullResult = craft({
      id: 'full',
      inputs: [],
      outputs: [{ contentId: 'potion', quantity: 1 }],
    }, full, factory)
    expect(fullResult.reason).toBe('full')

    const generated = craft({
      id: 'rng',
      inputs: [],
      outputs: [],
      createOutputs: (stream, itemFactory) => [
        itemFactory.create('potion', { quantity: stream === undefined ? 1 : 2 }),
      ],
    }, new Inventory({ capacity: 1, catalog }), factory, { rng: rng() })
    expect(generated.ok).toBe(true)
    expect(generated.ok && generated.value[0]?.quantity).toBe(2)
    const again = craft({
      id: 'rng',
      inputs: [],
      outputs: [],
      createOutputs: (stream, itemFactory) => [
        itemFactory.create('potion', { quantity: stream === undefined ? 1 : 2 }),
      ],
    }, new Inventory({ capacity: 1, catalog }), factory, { rng: rng() })
    expect(generated.ok && again.ok && generated.value[0]?.quantity === again.value[0]?.quantity).toBe(true)
  })

  it('sockets gems without mutating the source instance', () => {
    const item = new ItemFactory({ catalog }).create('sword')
    const socketed = socketGem(item, 0, 'gem', catalog)
    expect(socketed.ok).toBe(true)
    expect(item.sockets).toEqual([null])
    expect(socketed.ok && socketed.value.sockets).toEqual(['gem'])
    expect(socketGem(socketed.ok ? socketed.value : item, 0, 'gem', catalog).reason).toBe('socket_full')
    expect(socketGem(item, 2, 'gem', catalog).reason).toBe('invalid_socket')
  })
})
