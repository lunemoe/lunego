import { World, defineFeature, defineModel, defineSystem, t } from '../index.js'

const Wallet = defineModel(
  'TypeTestWallet',
  { gold: t.i32, items: t.array(t.i32), stats: t.struct({ hp: t.f32 }) },
  { gold: 0, items: [], stats: { hp: 1 } },
)

const feature = defineFeature({
  name: 'type-test',
  schema: { models: [Wallet] },
  systems: [
    defineSystem({
      name: 'type-test.write',
      phase: 'update',
      writes: [Wallet],
      run(ctx) {
        const wallet = ctx.mutModel(Wallet)
        wallet.gold = 3
        wallet.items.push(1)
        wallet.stats.hp = 2
        const read = ctx.model(Wallet)
        const gold: number = read.gold
        void gold
      },
    }),
  ],
})

void World
void feature
