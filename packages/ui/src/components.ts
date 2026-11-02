import { createEffect, createMemo, createSignal, onCleanup, type Accessor } from 'solid-js'
import html from 'solid-js/html'
import { themeVariables, type UiTheme } from './theme.js'
import { readValue, type UiChild, type UiNode, type UiValue } from './ui-types.js'
import { defaultMenuStack, type MenuLayer, type UiMenuStack } from './menu.js'
import { Tooltip } from './tooltip.js'


export function createUiSignal<T>(initial: T): [Accessor<T>, (next: T) => void] {
  const [get, set] = createSignal(initial)
  return [get, (next: T) => set(() => next)]
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

export interface UiRootProps {
  readonly theme?: UiTheme
  readonly uiScale?: UiValue<number>
  readonly reducedMotion?: UiValue<boolean>
  readonly children: UiChild | (() => UiChild)
}

export function UiRoot(props: UiRootProps): UiNode {
  const style = () => ({
    ...themeVariables(props.theme),
    ...(props.uiScale === undefined ? {} : { '--lg-ui-scale': String(readValue(props.uiScale)) }),
  })
  return html`<div class="lg-ui" style=${style}
    data-reduced-motion=${() => String(props.reducedMotion === undefined ? false : readValue(props.reducedMotion))}>${props.children}</div>`
}

export interface PanelProps {
  readonly title?: UiValue<string | undefined>
  readonly borderImage?: UiValue<string | undefined>
  readonly borderSlice?: number
  readonly borderWidth?: number
  readonly children: UiChild | (() => UiChild)
}

export function Panel(props: PanelProps): UiNode {
  const hasImage = () => {
    const image = readValue(props.borderImage)
    return image !== undefined && image.length > 0
  }
  const style = () => {
    const image = readValue(props.borderImage)
    return image === undefined || image.length === 0
      ? {}
      : {
          '--lg-panel-image': `url("${image}")`,
          '--lg-panel-slice': String(props.borderSlice ?? 8),
          '--lg-panel-border': String(props.borderWidth ?? 8),
        }
  }
  return html`<section class=${() => (hasImage() ? 'lg-panel has-image' : 'lg-panel')} style=${style}>
    ${() => {
      const title = readValue(props.title)
      return title === undefined ? null : html`<h2 class="lg-panel__title">${title}</h2>`
    }}
    ${props.children}
  </section>`
}

export type BarKind = 'hp' | 'mp' | 'xp' | 'neutral'

export interface BarProps {
  readonly value: UiValue<number>
  readonly max: UiValue<number>
  readonly kind?: BarKind
  readonly label?: UiValue<string | undefined>
}

export function Bar(props: BarProps): UiNode {
  const percent = () => {
    const max = readValue(props.max)
    return max <= 0 ? 0 : clamp(readValue(props.value) / max, 0, 1) * 100
  }
  const label = () => {
    const text = readValue(props.label)
    return text ?? `${Math.ceil(readValue(props.value))}/${Math.ceil(readValue(props.max))}`
  }
  return html`<div class=${() => `lg-bar lg-bar--${props.kind ?? 'neutral'}`} role="progressbar"
    aria-valuemin="0" aria-valuemax=${() => readValue(props.max)} aria-valuenow=${() => readValue(props.value)}>
    <div class="lg-bar__fill" style=${() => ({ width: `${percent()}%` })}></div>
    <span class="lg-bar__label">${label}</span>
  </div>`
}

export interface ButtonProps {
  readonly onClick?: () => void
  readonly disabled?: UiValue<boolean>
  readonly variant?: 'default' | 'primary'
  readonly children: UiChild | (() => UiChild)
}

export function Button(props: ButtonProps): UiNode {
  return html`<button class=${() => (props.variant === 'primary' ? 'lg-button lg-button--primary' : 'lg-button')}
    disabled=${() => readValue(props.disabled ?? false)}
    onClick=${() => props.onClick?.()}>${props.children}</button>`
}

export interface TabItem {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean
}

export interface TabsProps {
  readonly tabs: UiValue<readonly TabItem[]>
  readonly active: UiValue<string>
  readonly onSelect: (id: string) => void
}

export function Tabs(props: TabsProps): UiNode {
  const list = () => readValue(props.tabs)
  const move = (direction: number): void => {
    const enabled = list().filter((tab) => tab.disabled !== true)
    if (enabled.length === 0) {
      return
    }
    const current = enabled.findIndex((tab) => tab.id === readValue(props.active))
    const next = (current + direction + enabled.length) % enabled.length
    const target = enabled[next]
    if (target !== undefined) {
      props.onSelect(target.id)
    }
  }
  const items = createMemo(() =>
    list().map((tab) =>
      html`<button class=${() => (tab.id === readValue(props.active) ? 'lg-tab active' : 'lg-tab')}
        role="tab" aria-selected=${() => String(tab.id === readValue(props.active))}
        disabled=${tab.disabled === true}
        onClick=${() => props.onSelect(tab.id)}>${tab.label}</button>`,
    ),
  )
  return html`<div class="lg-tabs" role="tablist"
    onKeyDown=${(event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        move(1)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        move(-1)
      }
    }}>${items}</div>`
}

export interface ItemData {
  readonly id: string
  readonly label: string
  readonly icon?: string | null
  readonly count?: number
  readonly tooltip?: string | null
  readonly disabled?: boolean
}

export interface ItemSlotProps {
  readonly item?: ItemData | null
  readonly selected?: UiValue<boolean>
  readonly onClick?: () => void
  readonly label?: string
  readonly emptyLabel?: string
}

export function ItemSlot(props: ItemSlotProps): UiNode {
  const item = () => props.item ?? null
  const button = html`<button class=${() => (readValue(props.selected ?? false) ? 'lg-slot selected' : 'lg-slot')}
    aria-label=${() => item()?.label ?? props.label ?? props.emptyLabel ?? ''}
    disabled=${() => item()?.disabled === true || item() === null}
    onClick=${() => props.onClick?.()}>
    ${() => {
      const current = item()
      if (current === null) {
        return ''
      }
      return current.icon !== undefined && current.icon !== null
        ? html`<img src=${current.icon} alt=${current.label} draggable="false" />`
        : html`<span>${current.label.slice(0, 1).toUpperCase()}</span>`
    }}
    ${() => {
      const count = item()?.count
      return count !== undefined && count > 1
        ? html`<span class="lg-slot__count">${count}</span>`
        : null
    }}
  </button>`
  return item()?.tooltip === undefined || item()?.tooltip === null
    ? button
    : Tooltip({ content: item()?.tooltip ?? null, children: button })
}

export interface InventoryGridProps {
  readonly items: UiValue<readonly ItemData[]>
  readonly columns?: number
  readonly minSlots?: number
  readonly selected?: UiValue<string | null>
  readonly onSelect?: (item: ItemData | null) => void
}

export function InventoryGrid(props: InventoryGridProps): UiNode {
  const slots = createMemo(() => {
    const items = readValue(props.items)
    const total = Math.max(items.length, props.minSlots ?? items.length)
    const nodes: UiNode[] = []
    for (let index = 0; index < total; index += 1) {
      const item = items[index] ?? null
      nodes.push(
        ItemSlot({
          item,
          selected: () => item !== null && readValue(props.selected ?? null) === item.id,
          onClick: () => props.onSelect?.(item),
        }),
      )
    }
    return nodes
  })
  return html`<div class="lg-inventory" style=${() => ({ gridTemplateColumns: `repeat(${props.columns ?? 6}, minmax(0, 1fr))` })}>${slots}</div>`
}

export interface SkillSlotData {
  readonly id: string
  readonly label: string
  readonly icon?: string | null
  readonly key?: string
  /** 0 = ready, 1 = full cooldown. */
  readonly cooldown?: number
  readonly disabled?: boolean
}

export interface SkillBarProps {
  readonly slots: UiValue<readonly SkillSlotData[]>
  readonly onActivate?: (id: string) => void
  /** Localized accessible label supplied by the game. */
  readonly label?: string
}

export function SkillBar(props: SkillBarProps): UiNode {
  const nodes = createMemo(() =>
    readValue(props.slots).map((slot) =>
      html`<button class="lg-skill" aria-label=${slot.label} disabled=${slot.disabled === true}
        onClick=${() => props.onActivate?.(slot.id)}>
        ${slot.icon !== undefined && slot.icon !== null
          ? html`<img src=${slot.icon} alt=${slot.label} draggable="false" />`
          : html`<span>${slot.label.slice(0, 1)}</span>`}
        <span class="lg-skill__cooldown" style=${() => ({ height: `${clamp(slot.cooldown ?? 0, 0, 1) * 100}%` })}></span>
        ${slot.key === undefined ? null : html`<span class="lg-skill__key">${slot.key}</span>`}
      </button>`,
    ),
  )
  return html`<div class="lg-skillbar" role="toolbar" aria-label=${() => props.label ?? ''}>${nodes}</div>`
}

export interface KeyHintProps {
  readonly keys: UiValue<readonly string[]>
}

export function KeyHint(props: KeyHintProps): UiNode {
  const nodes = createMemo(() => readValue(props.keys).map((key) => html`<kbd>${key}</kbd>`))
  return html`<span class="lg-keyhint">${nodes}</span>`
}

export interface ModalProps {
  readonly open: UiValue<boolean>
  readonly title?: UiValue<string | undefined>
  readonly onClose?: () => void
  readonly closeOnBackdrop?: boolean
  /** Localized accessible label supplied by the game. */
  readonly closeLabel?: string
  readonly menuStack?: UiMenuStack
  readonly children: UiChild | (() => UiChild)
}

export function Modal(props: ModalProps): UiNode {
  const stack = props.menuStack ?? defaultMenuStack
  let dialog: HTMLElement | undefined
  let layer: MenuLayer | null = null
  createEffect(() => {
    const open = readValue(props.open)
    if (open && layer === null) {
      const nextLayer: MenuLayer = {
        element: () => dialog,
        onClose: () => props.onClose?.(),
      }
      layer = nextLayer
      stack.push(nextLayer)
    } else if (!open && layer !== null) {
      stack.pop(layer)
      layer = null
    }
  })
  onCleanup(() => {
    if (layer !== null) {
      stack.pop(layer)
      layer = null
    }
  })
  return html`<div class="lg-modal__backdrop" style=${() => ({ display: readValue(props.open) ? 'grid' : 'none' })}
    onClick=${(event: MouseEvent) => {
      if ((props.closeOnBackdrop ?? true) && event.target === event.currentTarget) {
        props.onClose?.()
      }
    }}>
    <section ref=${(node: HTMLElement) => { dialog = node }} class="lg-panel lg-modal" role="dialog" aria-modal="true" aria-hidden=${() => String(!readValue(props.open))}>
      <div class="lg-modal__head">
        <h2 class="lg-modal__title">${() => readValue(props.title ?? '')}</h2>
        <button class="lg-button" aria-label=${() => props.closeLabel ?? ''} onClick=${() => props.onClose?.()}>×</button>
      </div>
      ${props.children}
    </section>
  </div>`
}

export interface ListProps<T> {
  readonly items: UiValue<readonly T[]>
  readonly renderItem: (item: T, index: number) => UiNode
  readonly empty?: string
  readonly selected?: UiValue<number | null>
  readonly onSelect?: (item: T, index: number) => void
}

export function List<T>(props: ListProps<T>): UiNode {
  const nodes = createMemo(() => {
    const items = readValue(props.items)
    if (items.length === 0) {
      return html`<li class="lg-list__empty">${props.empty ?? ''}</li>`
    }
    return items.map((item, index) =>
      html`<li class=${() => (readValue(props.selected ?? null) === index ? 'lg-list__item selected' : 'lg-list__item')}
        onClick=${() => props.onSelect?.(item, index)}>${props.renderItem(item, index)}</li>`,
    )
  })
  return html`<ul class="lg-list">${nodes}</ul>`
}

