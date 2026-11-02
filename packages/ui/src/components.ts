import { createEffect, createMemo, createSignal, on, onCleanup, type Accessor } from 'solid-js'
import html from 'solid-js/html'
import { activateOnKey } from './a11y.js'
import { resolveText, setUiTextResolver, type TextValue, type UiI18nSource, type UiTextResolver } from './text.js'
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
  /** Resolver or `@lunego/i18n`-shaped source for `{ key }` text values. */
  readonly i18n?: UiTextResolver | UiI18nSource
  /** Boolean or named color-vision mode written as `data-colorblind`. */
  readonly colorblind?: UiValue<boolean | string>
  /** Boolean or named contrast mode written as `data-contrast`. */
  readonly contrast?: UiValue<boolean | string>
  readonly children: UiChild | (() => UiChild)
}

export function UiRoot(props: UiRootProps): UiNode {
  const style = () => ({
    ...themeVariables(props.theme),
    ...(props.uiScale === undefined ? {} : { '--lg-ui-scale': String(readValue(props.uiScale)) }),
  })
  createEffect(on(() => props.i18n, (source) => {
    if (source !== undefined) {
      onCleanup(setUiTextResolver(source))
    }
  }))
  return html`<div class="lg-ui" style=${style}
    data-reduced-motion=${() => String(props.reducedMotion === undefined ? false : readValue(props.reducedMotion))}
    data-colorblind=${() => (props.colorblind === undefined ? undefined : String(readValue(props.colorblind)))}
    data-contrast=${() => (props.contrast === undefined ? undefined : String(readValue(props.contrast)))}>${props.children}</div>`
}

export interface PanelProps {
  readonly title?: UiValue<TextValue | undefined>
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
      return title === undefined ? null : html`<h2 class="lg-panel__title">${resolveText(title)}</h2>`
    }}
    ${props.children}
  </section>`
}

export type BarKind = 'hp' | 'mp' | 'xp' | 'neutral'

export interface BarProps {
  readonly value: UiValue<number>
  readonly max: UiValue<number>
  readonly kind?: BarKind
  readonly label?: UiValue<TextValue | undefined>
}

export function Bar(props: BarProps): UiNode {
  const percent = () => {
    const max = readValue(props.max)
    return max <= 0 ? 0 : clamp(readValue(props.value) / max, 0, 1) * 100
  }
  const label = () => {
    const text = props.label === undefined ? undefined : readValue(props.label)
    return text === undefined
      ? `${Math.ceil(readValue(props.value))}/${Math.ceil(readValue(props.max))}`
      : resolveText(text)
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
  /** Explicit literal override or `{ key }` reference used when children are absent. */
  readonly label?: UiValue<TextValue | undefined>
  readonly children?: UiChild | (() => UiChild)
}

export function Button(props: ButtonProps): UiNode {
  const label = () => {
    const value = props.label === undefined ? undefined : readValue(props.label)
    return value === undefined ? '' : resolveText(value)
  }
  const activate = (): void => props.onClick?.()
  return html`<button class=${() => (props.variant === 'primary' ? 'lg-button lg-button--primary' : 'lg-button')}
    disabled=${() => readValue(props.disabled ?? false)}
    aria-label=${() => (props.label === undefined ? undefined : label())}
    onClick=${activate}
    onKeyDown=${activateOnKey(activate)}>${() => props.children ?? label()}</button>`
}

export interface TabItem {
  readonly id: string
  readonly label: TextValue
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
        onClick=${() => props.onSelect(tab.id)}>${() => resolveText(tab.label)}</button>`,
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
  readonly label: TextValue
  readonly icon?: string | null
  readonly count?: number
  readonly tooltip?: TextValue | null
  readonly disabled?: boolean
}

export interface ItemSlotProps {
  readonly item?: ItemData | null
  readonly selected?: UiValue<boolean>
  readonly onClick?: () => void
  readonly label?: TextValue
  readonly emptyLabel?: TextValue
}

export function ItemSlot(props: ItemSlotProps): UiNode {
  const item = () => props.item ?? null
  const label = () => {
    const value = item()?.label ?? props.label ?? props.emptyLabel
    return value === undefined ? '' : resolveText(value)
  }
  const button = html`<button class=${() => (readValue(props.selected ?? false) ? 'lg-slot selected' : 'lg-slot')}
    aria-label=${label}
    disabled=${() => item()?.disabled === true || item() === null}
    onClick=${() => props.onClick?.()}>
    ${() => {
      const current = item()
      if (current === null) {
        return ''
      }
      const text = resolveText(current.label)
      return current.icon !== undefined && current.icon !== null
        ? html`<img src=${current.icon} alt=${text} draggable="false" />`
        : html`<span>${text.slice(0, 1).toUpperCase()}</span>`
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
  readonly label?: TextValue
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
  return html`<div class="lg-inventory" aria-label=${() => (props.label === undefined ? undefined : resolveText(props.label))}
    style=${() => ({ gridTemplateColumns: `repeat(${props.columns ?? 6}, minmax(0, 1fr))` })}>${slots}</div>`
}

export interface SkillSlotData {
  readonly id: string
  readonly label: TextValue
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
  readonly label?: TextValue
}

export function SkillBar(props: SkillBarProps): UiNode {
  const nodes = createMemo(() =>
    readValue(props.slots).map((slot) => {
      const label = () => resolveText(slot.label)
      return html`<button class="lg-skill" aria-label=${label} disabled=${slot.disabled === true}
        onClick=${() => props.onActivate?.(slot.id)}>
        ${slot.icon !== undefined && slot.icon !== null
          ? html`<img src=${slot.icon} alt=${label()} draggable="false" />`
          : html`<span>${label().slice(0, 1)}</span>`}
        <span class="lg-skill__cooldown" style=${() => ({ height: `${clamp(slot.cooldown ?? 0, 0, 1) * 100}%` })}></span>
        ${slot.key === undefined ? null : html`<span class="lg-skill__key">${slot.key}</span>`}
      </button>`
    }),
  )
  return html`<div class="lg-skillbar" role="toolbar" aria-label=${() => (props.label === undefined ? '' : resolveText(props.label))}>${nodes}</div>`
}

export interface KeyHintProps {
  readonly keys: UiValue<readonly string[]>
  readonly label?: TextValue
}

export function KeyHint(props: KeyHintProps): UiNode {
  const nodes = createMemo(() => readValue(props.keys).map((key) => html`<kbd>${key}</kbd>`))
  return html`<span class="lg-keyhint" role="group" aria-label=${() => (props.label === undefined ? undefined : resolveText(props.label))}>${nodes}</span>`
}

export interface ModalProps {
  readonly open: UiValue<boolean>
  readonly title?: UiValue<TextValue | undefined>
  readonly onClose?: () => void
  readonly closeOnBackdrop?: boolean
  /** Localized accessible label supplied by the game. */
  readonly closeLabel?: TextValue
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
        <h2 class="lg-modal__title">${() => {
          const title = props.title === undefined ? undefined : readValue(props.title)
          return title === undefined ? '' : resolveText(title)
        }}</h2>
        <button class="lg-button" aria-label=${() => (props.closeLabel === undefined ? '' : resolveText(props.closeLabel))}
          onClick=${() => props.onClose?.()}>×</button>
      </div>
      ${props.children}
    </section>
  </div>`
}


