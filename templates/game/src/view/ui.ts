import type { UiBridge, UiMenuStack } from '@lunego/ui'
import {
  Bar,
  Button,
  createMemo,
  Dialog,
  KeyHint,
  List,
  Modal,
  Panel,
  ShopRow,
  UiRoot,
  createUiSignal,
  html,
  mountUi,
} from '@lunego/ui'
import {
  AcceptQuest,
  AttackTarget,
  BuyItem,
  DialogueChoose,
  DialogueStart,
  EquipItem,
  MoveIntent,
  PickupItem,
  TurnInQuest,
} from '@lunego/kit-runtime'
import type { HudView } from '../../features/motion/schema.js'
import { i18n, t } from '../i18n.js'

export interface DemoUiOptions {
  readonly bridge: UiBridge
  readonly menuStack: UiMenuStack
  readonly hud: () => HudView | null
  readonly save: () => void
  readonly load: () => void
}

export interface DemoUiHandle {
  setGamepadConnected(value: boolean): void
}

export function mountDemoUi(options: DemoUiOptions): DemoUiHandle {
  const bridge = options.bridge
  const menuStack = options.menuStack
  const [helpOpen, setHelpOpen] = createUiSignal(false)
  const [settingsOpen, setSettingsOpen] = createUiSignal(false)
  const [inventoryOpen, setInventoryOpen] = createUiSignal(false)
  const [questsOpen, setQuestsOpen] = createUiSignal(false)
  const [dialogueOpen, setDialogueOpen] = createUiSignal(false)
  const [shopOpen, setShopOpen] = createUiSignal(false)
  const [uiScale, setUiScale] = createUiSignal(1)
  const [reducedMotion, setReducedMotion] = createUiSignal(false)
  const [gamepadConnected, setGamepadConnected] = createUiSignal(false)
  const openMenu = (open: (value: boolean) => void): void => { open(true) }
  const closeMenu = (open: (value: boolean) => void): void => { open(false) }

  {
    mountUi('#ui', bridge, (ui) => {
      const view = (): HudView | null => { void ui.frame(); return options.hud() }
      const inventoryItems = createMemo(() => view()?.inventory ?? [], undefined, {
        equals: (left, right) => JSON.stringify(left) === JSON.stringify(right),
      })
      const questItems = createMemo(() => view()?.quests ?? [], undefined, {
        equals: (left, right) => JSON.stringify(left) === JSON.stringify(right),
      })
      const profile = (): { name?: string; level?: number } => (ui.models()['CharacterProfile'] as { name?: string; level?: number } | undefined) ?? {}
      return UiRoot({
        theme: { accent: '#58c8ff', accentText: '#08121c' },
        uiScale,
        reducedMotion,
        i18n,
        children: [
          Panel({
            title: { key: 'demo.title' },
            children: [
              Bar({
                kind: 'hp',
                value: () => view()?.hp ?? 0,
                max: () => view()?.maxHp ?? 1,
              }),
              Button({ children: t('demo.moveRight'), onClick: () => void ui.send(MoveIntent.type, { x: 90, y: 0 }) }),
              Button({ children: t('demo.attack'), onClick: () => {
                const target = view()?.enemy ?? 0
                if (target > 0) void ui.send(AttackTarget.type, { target, ability: 'demo.strike' })
              } }),
              Button({ children: t('demo.pickup'), onClick: () => {
                const ground = view()?.ground ?? 0
                if (ground > 0) void ui.send(PickupItem.type, { ground })
              } }),
              Button({ children: t('demo.inventory'), onClick: () => openMenu(setInventoryOpen) }),
              Button({ children: t('demo.quests'), onClick: () => openMenu(setQuestsOpen) }),
              Button({ children: t('demo.dialogue'), onClick: () => {
                void ui.send(DialogueStart.type, { dialogue: 'demo.dialogue' })
                openMenu(setDialogueOpen)
              } }),
              Button({ children: t('demo.shop'), onClick: () => openMenu(setShopOpen) }),
              Button({ children: t('demo.save'), onClick: options.save }),
              Button({ children: t('demo.load'), onClick: options.load }),
              Button({ children: t('demo.help'), onClick: () => openMenu(setHelpOpen) }),
              Button({ children: t('demo.settings'), onClick: () => openMenu(setSettingsOpen) }),
              html`<div class="lg-panel__meta">
                ${() => gamepadConnected() ? html`<p class="lg-panel__notice">${t('demo.gamepad')}</p>` : null}
                ${() => profile().name === undefined ? null : html`<p class="lg-panel__profile">${profile().name} Lv.${profile().level ?? 1}</p>`}
              </div>`,
            ],
          }),
          Modal({
            open: inventoryOpen,
            title: { key: 'demo.inventory' },
            menuStack,
            onClose: () => closeMenu(setInventoryOpen),
            children: [
              List({
                items: inventoryItems,
                empty: { key: 'demo.emptyInventory' },
                label: { key: 'demo.inventory' },
                renderItem: (item) => html`<span>${item.contentId} x${item.quantity}</span>`,
                onSelect: (item) => {
                  const slot = item.slot
                  if (slot >= 0) void ui.send(EquipItem.type, { slot })
                },
              }),
            ],
          }),
          Modal({
            open: questsOpen,
            title: { key: 'demo.quests' },
            menuStack,
            onClose: () => closeMenu(setQuestsOpen),
            children: [
              List({
                items: questItems,
                empty: { key: 'demo.emptyQuests' },
                label: { key: 'demo.quests' },
                renderItem: (quest) => html`<span>${quest.id} — ${quest.status} (${quest.progress})</span>`,
                onSelect: (quest) => {
                  void ui.send(quest.status === 'active' ? AcceptQuest.type : TurnInQuest.type, { quest: quest.id })
                },
              }),
            ],
          }),
          Modal({
            open: dialogueOpen,
            title: { key: 'demo.dialogue' },
            menuStack,
            onClose: () => closeMenu(setDialogueOpen),
            children: [
              Dialog({
                speaker: { key: 'demo.dialogue' },
                text: { key: 'demo.dialogue.start' },
                choices: [{ id: 'accept', label: { key: 'demo.accept' } }],
                onChoose: (choice) => {
                  void ui.send(DialogueChoose.type, { choice })
                  closeMenu(setDialogueOpen)
                },
              }),
            ],
          }),
          Modal({
            open: shopOpen,
            title: { key: 'demo.shop' },
            menuStack,
            onClose: () => closeMenu(setShopOpen),
            children: [
              ShopRow({
                name: { key: 'demo.item.potion' },
                price: 10,
                buyLabel: { key: 'demo.buy' },
                sellLabel: { key: 'demo.sell' },
                onBuy: () => void ui.send(BuyItem.type, { vendor: 'demo.vendor', slot: 0 }),
                sellDisabled: true,
              }),
            ],
          }),
          Modal({
            open: helpOpen,
            title: { key: 'demo.controls' },
            menuStack,
            onClose: () => closeMenu(setHelpOpen),
            children: [
              KeyHint({ keys: ['W', 'A', 'S', 'D'] }),
              KeyHint({ keys: ['F', 'E'] }),
              Button({ children: t('demo.close'), onClick: () => closeMenu(setHelpOpen) }),
            ],
          }),
          Modal({
            open: settingsOpen,
            title: { key: 'demo.settings' },
            menuStack,
            onClose: () => closeMenu(setSettingsOpen),
            children: [
              Button({
                children: () => `${t('demo.uiScale')} ${uiScale().toFixed(2)}`,
                onClick: () => setUiScale(uiScale() >= 1.5 ? 1 : uiScale() + 0.25),
              }),
              Button({
                children: () => `${t('demo.reducedMotion')} ${reducedMotion() ? 'on' : 'off'}`,
                onClick: () => setReducedMotion(!reducedMotion()),
              }),
              Button({ children: t('demo.close'), onClick: () => closeMenu(setSettingsOpen) }),
            ],
          }),
        ],
      })
    })
  }

  return { setGamepadConnected }
}
