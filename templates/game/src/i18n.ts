import { createI18n, defineMessages } from '@lunego/i18n'

export const messages = defineMessages({
  en: {
    'demo.title': 'Status',
    'demo.moveRight': 'Move right',
    'demo.help': 'Help',
    'demo.settings': 'Settings',
    'demo.controls': 'Controls',
    'demo.close': 'Close',
    'demo.attack': 'Attack',
    'demo.pickup': 'Pick up',
    'demo.inventory': 'Inventory',
    'demo.quests': 'Quests',
    'demo.quest': 'Track quest',
    'demo.dialogue': 'Talk',
    'demo.accept': 'Accept',
    'demo.save': 'Save',
    'demo.load': 'Load',
    'demo.shop': 'Shop',
    'demo.buy': 'Buy',
    'demo.sell': 'Sell',
    'demo.equip': 'Equip',
    'demo.emptyInventory': 'Nothing carried',
    'demo.emptyQuests': 'No active quest',
    'demo.reducedMotion': 'Reduced motion',
    'demo.uiScale': 'UI scale',
    'demo.gamepad': 'Gamepad connected',
    'demo.dialogue.start': 'A traveller offers a contract.',
    'demo.dialogue.accept': 'Accept the contract',
    'demo.dialogue.end': 'Safe travels.',
    'demo.error': 'Action failed',
    'demo.item.blade': 'Training blade',
    'demo.item.potion': 'Potion',
    'demo.itemPicked': 'Picked up {item}',
  },
})

export const i18n = createI18n({
  messages,
  locale: 'en',
  fallbackLocale: 'en',
  missing: 'error',
})

export const t = i18n.t
