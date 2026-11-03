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
  BuyItem,
  DialogueChoose,
  DialogueStart,
  EquipItem,
  TurnInQuest,
  UseItem,
  SellItem,
} from '@lunego/kit-runtime'
import type { HudView } from '../../features/adventure/schema.js'
import { Assets, assetUrl, barFillBackground, itemIcon } from '../assets.js'
import { i18n, itemName, t } from '../i18n.js'

export interface P9UiOptions {
  readonly bridge: UiBridge
  readonly menuStack: UiMenuStack
  readonly hud: () => HudView | null
  readonly save: () => void
  readonly load: () => void
  readonly advance: () => void
  readonly revive: () => void
  readonly restart: () => void
  readonly attack: (ability: string) => void
  readonly pickup: () => void
  readonly heal: () => void
  readonly send: (type: string, payload: unknown) => void
  readonly mute: (value: boolean) => void
  readonly reducedMotion: (value: boolean) => void
}

export interface P9UiHandle {
  setGamepadConnected(value: boolean): void
  notify(message: string): void
  openInventory(): void
  openQuests(): void
  openSettings(): void
}

export function mountP9Ui(options: P9UiOptions): P9UiHandle {
  const bridge = options.bridge
  const menuStack = options.menuStack
  const [muted, setMuted] = createUiSignal(false)
  const [notice, setNotice] = createUiSignal('')
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
      const outcome = createMemo(() => view()?.outcome ?? 'playing')
      const inventoryItems = createMemo(() => view()?.inventory ?? [], undefined, {
        equals: (left, right) => JSON.stringify(left) === JSON.stringify(right),
      })
      const questItems = createMemo(() => view()?.quests ?? [], undefined, {
        equals: (left, right) => JSON.stringify(left) === JSON.stringify(right),
      })
      const profile = (): { name?: string; level?: number } => (ui.models()['CharacterProfile'] as { name?: string; level?: number } | undefined) ?? {}
      return UiRoot({
        theme: { accent: '#f2c14e', accentText: '#101018', tokens: {
          '--p9-panel-slice': String(Assets.ui_panel_normal.nineSlice.border),
          '--p9-button-slice': String(Assets.ui_button_normal.nineSlice.border),
          '--p9-bar-slice': String(Assets.ui_bar_hp_frame.nineSlice.border),
          '--p9-panel': `url(${assetUrl(Assets.ui_panel_normal)})`,
          '--p9-button': `url(${assetUrl(Assets.ui_button_normal)})`,
          '--p9-button-hover': `url(${assetUrl(Assets.ui_button_hover)})`,
          '--p9-button-pressed': `url(${assetUrl(Assets.ui_button_pressed)})`,
          '--p9-button-disabled': `url(${assetUrl(Assets.ui_button_disabled)})`,
          '--p9-rarity-common': `url(${assetUrl(Assets.ui_rarity_common)})`,
          '--p9-rarity-magic': `url(${assetUrl(Assets.ui_rarity_uncommon)})`,
          '--p9-rarity-rare': `url(${assetUrl(Assets.ui_rarity_rare)})`,
          '--p9-slot': `url(${assetUrl(Assets.ui_slot_inventory)})`,
          '--p9-cursor': `url(${assetUrl(Assets.ui_cursor)}) 0 0, pointer`,
          '--p9-hp-frame': `url(${assetUrl(Assets.ui_bar_hp_frame)})`,
          '--p9-hp-fill': barFillBackground(Assets.ui_bar_hp_fill),
          '--p9-xp-frame': `url(${assetUrl(Assets.ui_bar_xp_frame)})`,
          '--p9-xp-fill': barFillBackground(Assets.ui_bar_xp_fill),
        } },
        uiScale,
        reducedMotion,
        i18n,
        children: [
          Panel({
            title: { key: 'p9.title' },
            borderImage: assetUrl(Assets.ui_panel_normal), borderSlice: Assets.ui_panel_normal.nineSlice.border, borderWidth: Assets.ui_panel_normal.nineSlice.border,
            children: [
              Bar({
                kind: 'hp',
                value: () => view()?.hp ?? 0,
                max: () => view()?.maxHp ?? 1,
              }),
              Bar({ kind: 'xp', value: () => view()?.xp ?? 0, max: () => view()?.nextLevelXp ?? 20 }),
              html`<p class="equipment-summary">Gold ${() => view()?.gold ?? 0} · Damage ${() => view()?.damage ?? 5}<br />Weapon +${() => view()?.weaponPower ?? 0}</p>`,
              html`<p class="run-progress">Floor ${() => view()?.stage ?? 1} · Wave ${() => view()?.wave ?? 1}/${() => view()?.waveCount ?? 3} · Enemies ${() => view()?.remaining ?? 0} · Kills ${() => view()?.kills ?? 0}</p>
                <p>${() => (view()?.nextWaveTicks ?? 0) > 0 ? `Next wave: ${((view()?.nextWaveTicks ?? 0) / 60).toFixed(1)}s` : view()?.phase ?? ''}</p>`,
              Button({ children: html`<span class="action-label"><img src=${assetUrl(Assets.skill_knight_cleave)} alt="" />${t('p9.attack')}</span>`, disabled: () => view()?.outcome !== 'playing' || (view()?.cooldowns.strike ?? 0) > 0, onClick: () => options.attack('p9.strike') }),
              Button({ children: html`<span class="action-label"><img src=${assetUrl(Assets.skill_mage_arc_surge)} alt="" />${() => `${t('p9.burst')} (${((view()?.cooldowns.burst ?? 0) / 60).toFixed(1)}s)`}</span>`, disabled: () => view()?.outcome !== 'playing' || (view()?.cooldowns.burst ?? 0) > 0, onClick: () => options.attack('p9.burst') }),
              Button({ children: () => `${t('p9.heal')} (${view()?.inventory.filter((item) => item.contentId === 'p9.potion').reduce((n, item) => n + item.quantity, 0) ?? 0})`, onClick: options.heal }),
              Button({ children: t('p9.pickup'), onClick: options.pickup }),
              Button({ children: t('p9.inventory'), onClick: () => openMenu(setInventoryOpen) }),
              Button({ children: t('p9.quests'), onClick: () => openMenu(setQuestsOpen) }),
              Button({ children: t('p9.dialogue'), onClick: () => {
                options.send(DialogueStart.type, { dialogue: 'p9.dialogue' })
                openMenu(setDialogueOpen)
              } }),
              Button({ children: t('p9.shop'), onClick: () => openMenu(setShopOpen) }),
              Button({ children: t('p9.save'), onClick: options.save }),
              Button({ children: t('p9.load'), onClick: options.load }),
              Button({ children: t('p9.help'), onClick: () => openMenu(setHelpOpen) }),
              Button({ children: t('p9.settings'), onClick: () => openMenu(setSettingsOpen) }),
              html`<div class="run-result">${() => outcome() === 'playing' ? null : html`<div><p>${t(outcome() === 'victory' ? 'p9.victory' : 'p9.defeat')}</p>${Button({ children: t(outcome() === 'victory' ? 'p9.advance' : 'p9.revive'), onClick: outcome() === 'victory' ? options.advance : options.revive })}</div>`}</div>`,
              html`<p class="action-notice" role="status" aria-live="polite">${notice}</p>`,
              html`<div class="lg-panel__meta">
                ${() => gamepadConnected() ? html`<p class="lg-panel__notice">${t('p9.gamepad')}</p>` : null}
                ${() => profile().name === undefined ? null : html`<p class="lg-panel__profile">${profile().name} Lv.${profile().level ?? 1}</p>`}
              </div>`,
            ],
          }),
          Modal({
            open: inventoryOpen,
            title: { key: 'p9.inventory' },
            menuStack,
            onClose: () => closeMenu(setInventoryOpen),
            children: [
              List({
                items: inventoryItems,
                empty: { key: 'p9.emptyInventory' },
                label: { key: 'p9.inventory' },
                renderItem: (item) => html`<span class=${`loot-${item.rarity}`}><img class="item-icon" src=${itemIcon(item.contentId)} alt="" />${item.rarity} · ${itemName(item.contentId)} ×${item.quantity}${item.power > 0 ? ` · +${item.power} damage` : ''}</span>`,
                onSelect: (item) => {
                  const slot = item.slot
                  if (slot >= 0) options.send(item.contentId === 'p9.potion' ? UseItem.type : EquipItem.type, { slot })
                  closeMenu(setInventoryOpen)
                },
              }),
            ],
          }),
          Modal({
            open: questsOpen,
            title: { key: 'p9.quests' },
            menuStack,
            onClose: () => closeMenu(setQuestsOpen),
            children: [
              List({
                items: questItems,
                empty: { key: 'p9.emptyQuests' },
                label: { key: 'p9.quests' },
                renderItem: (quest) => html`<span>${quest.id} — ${quest.status} (${quest.progress})</span>`,
                onSelect: (quest) => {
                  if (quest.status === 'completed') {
                    options.send(TurnInQuest.type, { quest: quest.id })
                    closeMenu(setQuestsOpen)
                  }
                },
              }),
            ],
          }),
          Modal({
            open: dialogueOpen,
            title: { key: 'p9.dialogue' },
            menuStack,
            onClose: () => closeMenu(setDialogueOpen),
            children: [
              Dialog({
                speaker: { key: 'p9.dialogue' },
                text: { key: 'p9.dialogue.start' },
                choices: [{ id: 'accept', label: { key: 'p9.accept' } }],
                onChoose: (choice) => {
                  options.send(DialogueChoose.type, { choice })
                  closeMenu(setDialogueOpen)
                },
              }),
            ],
          }),
          Modal({
            open: shopOpen,
            title: { key: 'p9.shop' },
            menuStack,
            onClose: () => closeMenu(setShopOpen),
            children: [
              ShopRow({
                name: { key: 'p9.item.potion' },
                icon: itemIcon('p9.potion'),
                price: 10,
                buyLabel: { key: 'p9.buy' },
                sellLabel: { key: 'p9.sell' },
                onBuy: () => { options.send(BuyItem.type, { vendor: 'p9.vendor', slot: 0 }); closeMenu(setShopOpen) },
                sellDisabled: true,
              }),
              List({
                label: 'Sell items', items: inventoryItems, empty: 'Nothing to sell',
                renderItem: (item) => html`<span>Sell ${itemName(item.contentId)} ×${item.quantity}</span>`,
                onSelect: (item) => { options.send(SellItem.type, { vendor: 'p9.vendor', slot: item.slot }); closeMenu(setShopOpen) },
              }),
            ],
          }),
          Modal({
            open: helpOpen,
            title: { key: 'p9.controls' },
            menuStack,
            onClose: () => closeMenu(setHelpOpen),
            children: [
              KeyHint({ keys: ['W', 'A', 'S', 'D'] }),
              KeyHint({ keys: ['F', 'R', 'E', 'H'] }),
              html`<p>${t('p9.controlsText')}</p>`,
              Button({ children: t('p9.close'), onClick: () => closeMenu(setHelpOpen) }),
            ],
          }),
          Modal({
            open: settingsOpen,
            title: { key: 'p9.settings' },
            menuStack,
            onClose: () => closeMenu(setSettingsOpen),
            children: [
              Button({
                children: () => `${t('p9.uiScale')} ${uiScale().toFixed(2)}`,
                onClick: () => setUiScale(uiScale() >= 1.5 ? 1 : uiScale() + 0.25),
              }),
              Button({
                children: () => `${t('p9.reducedMotion')} ${reducedMotion() ? 'on' : 'off'}`,
                onClick: () => { const value = !reducedMotion(); setReducedMotion(value); options.reducedMotion(value) },
              }),
              Button({ children: () => `${t('p9.mute')} ${muted() ? 'on' : 'off'}`, onClick: () => { const value = !muted(); setMuted(value); options.mute(value) } }),
              Button({ children: t('p9.restart'), onClick: () => { closeMenu(setSettingsOpen); options.restart() } }),
              Button({ children: t('p9.close'), onClick: () => closeMenu(setSettingsOpen) }),
            ],
          }),
        ],
      })
    })
  }

  return { setGamepadConnected, notify: setNotice,
    openInventory: () => openMenu(setInventoryOpen),
    openQuests: () => openMenu(setQuestsOpen),
    openSettings: () => openMenu(setSettingsOpen),
  }
}
