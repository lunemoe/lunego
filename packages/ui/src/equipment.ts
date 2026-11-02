import { createSignal } from 'solid-js'
import html from 'solid-js/html'
import { currentDrag, endDrag, type DragDropEvent } from './drag.js'
import { readValue, type UiNode, type UiValue } from './ui-types.js'

export interface EquipmentSlotData {
  readonly id: string
  /** Localized slot name supplied by the caller. */
  readonly label: string
  readonly icon?: string | null
  /** Localized item name supplied by the caller; may be null for an empty slot. */
  readonly itemLabel?: string | null
  readonly itemId?: string | null
  readonly disabled?: boolean
}

export interface EquipmentSlotsProps {
  readonly slots: UiValue<readonly EquipmentSlotData[]>
  /** Called with `{from,to,itemId}`; slot/item legality belongs to the caller. */
  readonly onDrop?: (event: DragDropEvent) => void
  readonly onSelect?: (slotId: string) => void
  /** Localized label for an empty slot. */
  readonly emptyLabel?: string
  /** Localized accessible label for the slot group. */
  readonly label?: string
  readonly columns?: number
}

/** Named equipment slots with drag/drop, roving focus and keyboard activation. */
export function EquipmentSlots(props: EquipmentSlotsProps): UiNode {
  const [focusIndex, setFocusIndex] = createSignal(0)
  const elements = new Map<number, HTMLElement>()
  const columns = () => Math.max(1, props.columns ?? 1)
  const slots = () => readValue(props.slots)

  const focusSlot = (index: number): void => {
    const total = slots().length
    if (total === 0) {
      return
    }
    const next = Math.max(0, Math.min(index, total - 1))
    setFocusIndex(next)
    elements.get(next)?.focus()
  }
  const activate = (slot: EquipmentSlotData): void => {
    if (slot.disabled === true) {
      return
    }
    const drag = currentDrag()
    if (drag !== null && props.onDrop !== undefined) {
      endDrag()
      props.onDrop({ itemId: drag.itemId, from: drag.from, to: slot.id })
      return
    }
    props.onSelect?.(slot.id)
  }
  const onKeyDown = (index: number, event: KeyboardEvent): void => {
    const step = columns()
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusSlot(index - 1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusSlot(index + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusSlot(index - step)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusSlot(index + step)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusSlot(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusSlot(slots().length - 1)
    } else if (event.key === ' ' || event.key === 'Enter') {
      const slot = slots()[index]
      if (slot !== undefined) {
        event.preventDefault()
        activate(slot)
      }
    } else if (event.key === 'Escape') {
      endDrag()
    }
  }

  return html`<div class="lg-equipment" role="group" aria-label=${() => props.label ?? ''}
    style=${() => ({ gridTemplateColumns: `repeat(${columns()}, minmax(0, 1fr))` })}>
    ${() =>
      slots().map((slot, index) => {
        const hasItem = () => slot.itemId !== undefined && slot.itemId !== null
        return html`<button type="button" class="lg-equipment__slot"
          data-slot-id=${slot.id}
          aria-label=${slot.label}
          aria-disabled=${() => String(slot.disabled === true)}
          disabled=${slot.disabled === true}
          tabIndex=${() => (focusIndex() === index ? 0 : -1)}
          ref=${(node: HTMLElement) => {
            elements.set(index, node)
          }}
          onDragOver=${(event: Event) => {
            if (currentDrag() !== null && slot.disabled !== true) {
              event.preventDefault()
            }
          }}
          onDrop=${(event: Event) => {
            const drag = currentDrag()
            if (drag === null || slot.disabled === true) {
              return
            }
            event.preventDefault()
            endDrag()
            props.onDrop?.({ itemId: drag.itemId, from: drag.from, to: slot.id })
          }}
          onClick=${() => activate(slot)}
          onKeyDown=${(event: KeyboardEvent) => onKeyDown(index, event)}>
          ${() => {
            if (hasItem() && slot.icon !== undefined && slot.icon !== null) {
              return html`<img class="lg-equipment__icon" src=${slot.icon}
                alt=${slot.itemLabel ?? ''} draggable="false" />`
            }
            if (hasItem()) {
              return html`<span class="lg-equipment__item">${slot.itemLabel ?? slot.label}</span>`
            }
            return html`<span class="lg-equipment__empty">${props.emptyLabel ?? ''}</span>`
          }}
          <span class="lg-equipment__label">${slot.label}</span>
        </button>`
      })}
  </div>`
}
