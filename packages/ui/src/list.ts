import { createEffect, createMemo, createSignal } from 'solid-js'
import html from 'solid-js/html'
import { isEditableTarget } from './a11y.js'
import { resolveText, type TextValue } from './text.js'
import { readValue, type UiNode, type UiValue } from './ui-types.js'

export interface ListProps<T> {
  readonly items: UiValue<readonly T[]>
  readonly renderItem: (item: T, index: number) => UiNode
  readonly empty?: TextValue
  readonly label?: TextValue
  readonly describedBy?: string
  readonly selected?: UiValue<number | null>
  readonly onSelect?: (item: T, index: number) => void
  /** Marks an option unavailable; keyboard navigation skips it and clicks are ignored. */
  readonly isDisabled?: (item: T, index: number) => boolean
}

/**
 * Single-select listbox with roving tabindex. Arrow/Home/End move the active
 * option (skipping disabled ones); Enter/Space selects. Escape is intentionally
 * not handled so an enclosing Modal/MenuStack can close. Editable descendants
 * keep their own keyboard behavior.
 */
export function List<T>(props: ListProps<T>): UiNode {
  const [active, setActive] = createSignal<number | null>(null)
  const elements = new Map<number, HTMLElement>()

  const items = () => readValue(props.items)
  const selectedIndex = (): number | null => {
    const value = readValue(props.selected ?? null)
    return value !== null && value >= 0 && value < items().length ? value : null
  }
  const disabledAt = (index: number): boolean => {
    const item = items()[index]
    return item === undefined || props.isDisabled?.(item, index) === true
  }
  const findEnabled = (start: number, step: 1 | -1): number | null => {
    const list = items()
    for (let index = start; index >= 0 && index < list.length; index += step) {
      const item = list[index]
      if (item !== undefined && props.isDisabled?.(item, index) !== true) {
        return index
      }
    }
    return null
  }
  const focusItem = (index: number): void => {
    setActive(index)
    elements.get(index)?.focus()
  }
  const move = (direction: 1 | -1): void => {
    const current = active()
    const start = current === null
      ? (direction > 0 ? 0 : items().length - 1)
      : current + direction
    const next = findEnabled(start, direction)
    if (next !== null) {
      focusItem(next)
    }
  }
  const select = (index: number): void => {
    const item = items()[index]
    if (item === undefined || disabledAt(index)) {
      return
    }
    setActive(index)
    props.onSelect?.(item, index)
  }

  createEffect(() => {
    const list = items()
    const current = active()
    if (list.length === 0) {
      if (current !== null) {
        setActive(null)
      }
      return
    }
    if (current !== null && current < list.length && !disabledAt(current)) {
      return
    }
    const selected = selectedIndex()
    const next = selected !== null && !disabledAt(selected)
      ? selected
      : findEnabled(0, 1)
    if (next !== active()) {
      setActive(next)
    }
  })

  const onKeyDown = (event: KeyboardEvent): void => {
    if (
      isEditableTarget(event.target) ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(-1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      const first = findEnabled(0, 1)
      if (first !== null) {
        focusItem(first)
      }
    } else if (event.key === 'End') {
      event.preventDefault()
      const last = findEnabled(items().length - 1, -1)
      if (last !== null) {
        focusItem(last)
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      const current = active()
      if (current !== null) {
        event.preventDefault()
        select(current)
      }
    }
  }

  const nodes = createMemo(() => {
    const list = items()
    if (list.length === 0) {
      return html`<li class="lg-list__empty" role="presentation">${props.empty === undefined ? '' : resolveText(props.empty)}</li>`
    }
    return list.map((item, index) => {
      const disabled = () => props.isDisabled?.(item, index) === true
      return html`<li class=${() => {
        const classes = ['lg-list__item']
        if (readValue(props.selected ?? null) === index) {
          classes.push('selected')
        }
        return classes.join(' ')
      }}
        role="option"
        aria-selected=${() => String(readValue(props.selected ?? null) === index)}
        aria-disabled=${() => String(disabled())}
        tabIndex=${() => (active() === index ? 0 : -1)}
        data-list-index=${index}
        ref=${(element: HTMLElement) => {
          elements.set(index, element)
        }}
        onClick=${(event: MouseEvent) => {
          if (isEditableTarget(event.target)) {
            return
          }
          select(index)
        }}>${props.renderItem(item, index)}</li>`
    })
  })

  return html`<ul class="lg-list" role="listbox" aria-orientation="vertical"
    aria-label=${() => (props.label === undefined ? undefined : resolveText(props.label))}
    aria-describedby=${() => props.describedBy}
    tabIndex=${() => (active() === null ? 0 : -1)}
    onKeyDown=${onKeyDown}>${nodes}</ul>`
}
