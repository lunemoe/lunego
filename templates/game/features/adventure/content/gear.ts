import type { LootTable } from '@lunego/kit-loot'

export const GearTable: LootTable = {
  rarities: [
    { id: 'common', weight: 60, minAffixes: 0, maxAffixes: 0 },
    { id: 'magic', weight: 32, minAffixes: 1, maxAffixes: 1 },
    { id: 'rare', weight: 8, minAffixes: 1, maxAffixes: 1 },
  ],
  affixes: [{ id: 'p9.power', weight: 1, rolls: [{ stat: 'power', mode: 'add', min: 1, max: 4, integer: true }] }],
}
