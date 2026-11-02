import { createEffect, createMemo, createSignal, onCleanup, type Accessor } from 'solid-js'
import html from 'solid-js/html'
import { themeVariables, type UiTheme } from './theme.js'

export type UiNode = Node | Node[]
export type UiChild = Node | string | number | readonly UiChild[]

export function createUiSignal<T>(initial: T): [Accessor<T>, (next: T) => void] {
  const [get, set] = createSignal(initial)
  return [get, (next: T) => set(() => next)]
}
export type UiValue<T> = T | Accessor<T>

function read<T>(value: UiValue<T>): T {
  return typeof value === 'function' ? (value as Accessor<T>)() : value
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

export interface UiRootProps {
  readonly theme?: UiTheme
  readonly children: UiChild | (() => UiChild)
}

export function UiRoot(props: UiRootProps): UiNode {
  const style = () => themeVariables(props.theme)
  return html`<div class="lg-ui" style=${style}>${props.children}</div>`
}

export interface PanelProps {
  readonly title?: UiValue<string | undefined>
  readonly borderImage?: UiValue<string | undefined>
  readonly borderSlice?: number
  readonly children: UiChild | (() => UiChild)
}

export function Panel(props: PanelProps): UiNode {
  const hasImage = () => {
    const image = read(props.borderImage)
    return image !== undefined && image.length > 0
  }
  const style = () => {
    const image = read(props.borderImage)
    return image === undefined || image.length === 0
      ? {}
      : {
          '--lg-panel-image': `url("${image}")`,
          '--lg-panel-slice': String(props.borderSlice ?? 8),
        }
  }
  return html`<section class=${() => (hasImage() ? 'lg-panel has-image' : 'lg-panel')} style=${style}>
    ${() => {
      const title = read(props.title)
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
    const max = read(props.max)
    return max <= 0 ? 0 : clamp(read(props.value) / max, 0, 1) * 100
  }
  const label = () => {
    const text = read(props.label)
    return text ?? `${Math.ceil(read(props.value))}/${Math.ceil(read(props.max))}`
  }
  return html`<div class=${() => `lg-bar lg-bar--${props.kind ?? 'neutral'}`} role="progressbar"
    aria-valuemin="0" aria-valuemax=${() => read(props.max)} aria-valuenow=${() => read(props.value)}>
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
    disabled=${() => read(props.disabled ?? false)}
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
  const list = () => read(props.tabs)
  const move = (direction: number): void => {
    const enabled = list().filter((tab) => tab.disabled !== true)
    if (enabled.length === 0) {
      return
    }
    const current = enabled.findIndex((tab) => tab.id === read(props.active))
    const next = (current + direction + enabled.length) % enabled.length
    const target = enabled[next]
    if (target !== undefined) {
      props.onSelect(target.id)
    }
  }
  const items = createMemo(() =>
    list().map((tab) =>
      html`<button class=${() => (tab.id === read(props.active) ? 'lg-tab active' : 'lg-tab')}
        role="tab" aria-selected=${() => String(tab.id === read(props.active))}
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

export interface TooltipProps {
  readonly content: UiValue<UiChild | null | undefined>
  readonly children: UiNode
}

export function Tooltip(props: TooltipProps): UiNode {
  return html`<span class="lg-tooltip">${props.children}
    ${() => {
      const content = read(props.content)
      return html`<span class="lg-tooltip__content" role="tooltip">${content ?? ''}</span>`
    }}
  </span>`
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
}

export function ItemSlot(props: ItemSlotProps): UiNode {
  const item = () => props.item ?? null
  const button = html`<button class=${() => (read(props.selected ?? false) ? 'lg-slot selected' : 'lg-slot')}
    aria-label=${() => item()?.label ?? props.label ?? 'Empty slot'}
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
    const items = read(props.items)
    const total = Math.max(items.length, props.minSlots ?? items.length)
    const nodes: UiNode[] = []
    for (let index = 0; index < total; index += 1) {
      const item = items[index] ?? null
      nodes.push(
        ItemSlot({
          item,
          selected: () => item !== null && read(props.selected ?? null) === item.id,
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
}

export function SkillBar(props: SkillBarProps): UiNode {
  const nodes = createMemo(() =>
    read(props.slots).map((slot) =>
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
  return html`<div class="lg-skillbar" role="toolbar" aria-label="Skills">${nodes}</div>`
}

export interface KeyHintProps {
  readonly keys: UiValue<readonly string[]>
}

export function KeyHint(props: KeyHintProps): UiNode {
  const nodes = createMemo(() => read(props.keys).map((key) => html`<kbd>${key}</kbd>`))
  return html`<span class="lg-keyhint">${nodes}</span>`
}

export interface ModalProps {
  readonly open: UiValue<boolean>
  readonly title?: UiValue<string | undefined>
  readonly onClose?: () => void
  readonly closeOnBackdrop?: boolean
  readonly children: UiChild | (() => UiChild)
}

export function Modal(props: ModalProps): UiNode {
  createEffect(() => {
    if (!read(props.open)) {
      return
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        props.onClose?.()
      }
    }
    document.addEventListener('keydown', onKey)
    onCleanup(() => document.removeEventListener('keydown', onKey))
  })
  return html`<div class="lg-modal__backdrop" style=${() => ({ display: read(props.open) ? 'grid' : 'none' })}
    onClick=${(event: MouseEvent) => {
      if ((props.closeOnBackdrop ?? true) && event.target === event.currentTarget) {
        props.onClose?.()
      }
    }}>
    <section class="lg-panel lg-modal" role="dialog" aria-modal="true" aria-hidden=${() => String(!read(props.open))}>
      <div class="lg-modal__head">
        <h2 class="lg-modal__title">${() => read(props.title ?? '')}</h2>
        <button class="lg-button" aria-label="Close" onClick=${() => props.onClose?.()}>×</button>
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
    const items = read(props.items)
    if (items.length === 0) {
      return html`<li class="lg-list__empty">${props.empty ?? 'Nothing here'}</li>`
    }
    return items.map((item, index) =>
      html`<li class=${() => (read(props.selected ?? null) === index ? 'lg-list__item selected' : 'lg-list__item')}
        onClick=${() => props.onSelect?.(item, index)}>${props.renderItem(item, index)}</li>`,
    )
  })
  return html`<ul class="lg-list">${nodes}</ul>`
}

