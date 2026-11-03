import { createI18n, defineMessages } from '@lunego/i18n'

export const messages = defineMessages({
  en: {
    'p9.title': 'P9',
    'p9.mute': 'Mute audio',
    'p9.help': 'Help',
    'p9.settings': 'Settings',
    'p9.controls': 'Controls',
    'p9.close': 'Close',
    'p9.attack': 'Attack',
    'p9.pickup': 'Pick up',
    'p9.inventory': 'Inventory',
    'p9.quests': 'Quests',
    'p9.quest': 'Track quest',
    'p9.dialogue': 'Talk',
    'p9.accept': 'Accept',
    'p9.save': 'Save',
    'p9.load': 'Load',
    'p9.shop': 'Shop',
    'p9.buy': 'Buy',
    'p9.sell': 'Sell',
    'p9.equip': 'Equip',
    'p9.emptyInventory': 'Nothing carried',
    'p9.emptyQuests': 'No active quest',
    'p9.reducedMotion': 'Reduced motion',
    'p9.uiScale': 'UI scale',
    'p9.gamepad': 'Gamepad connected',
    'p9.dialogue.start': 'A traveller offers a contract.',
    'p9.dialogue.accept': 'Accept the contract',
    'p9.dialogue.end': 'Safe travels.',
    'p9.error': 'Action failed',
    'p9.item.blade': 'Training blade',
    'p9.item.potion': 'Potion (+18 HP)',
    'p9.burst': 'Arcane burst',
    'p9.heal': 'Drink potion',
    'p9.advance': 'Next floor · N',
    'p9.revive': 'Revive · V (lose 20% gold)',
    'p9.restart': 'Restart',
    'p9.victory': 'Floor cleared — collect loot, then continue',
    'p9.defeat': 'Defeated — revive with gear and levels intact',
    'p9.controlsText': 'WASD / arrows move. Hold F / Space / left mouse to strike the nearest enemy. R / right mouse: burst. E: pick up. H: potion. I: inventory. Q: quests. Esc: pause / close. N: next floor. V: revive. K / J: save / load. Gamepad: left stick, A strike, B pick up, X burst, Y potion.',
    'p9.saved': 'Run saved',
    'p9.loaded': 'Run restored',
    'p9.noSave': 'No saved run yet',
    'p9.saveFailed': 'Save failed',
    'p9.loadFailed': 'Save incompatible or damaged; current progress preserved',
    'p9.outOfRange': 'Move closer to the target',
    'p9.cooldown': 'Ability is cooling down',
    'p9.fullHealth': 'Already at full health',
    'p9.noPotion': 'No potion carried',
    'p9.noTarget': 'No living enemy',
    'p9.noLoot': 'No loot to collect',
    'p9.inventoryFull': 'Inventory is full',
    'p9.noGold': 'Not enough gold',
    'p9.item.relic': 'Relic blade',
    'p9.itemPicked': 'Picked up {item}',
  },
})

export const i18n = createI18n({
  messages,
  locale: 'en',
  fallbackLocale: 'en',
  missing: 'error',
})

export const t = i18n.t

export function itemName(id: string): string {
  return t(id === 'p9.blade' ? 'p9.item.blade' : id === 'p9.relic' ? 'p9.item.relic' : 'p9.item.potion')
}
