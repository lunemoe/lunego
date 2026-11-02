import { createSignal } from 'solid-js'
import html from 'solid-js/html'
import {
  beginDrag,
  currentDrag,
  endDrag,
  sortableCellId,
  type DragDropEvent,
  type DragItemRef,
} from './drag.js'
import { readValue, type UiChild, type UiNode, type UiValue } from './ui-types.js'

export interface SortableGridProps<T> {
  readonly items: UiValue<readonly T[]>
  readonly itemId: (item: T, index: number) => string
  readonly source: string
  readonly columns?: number
  /** Receives the source/target cell ids; the caller owns reordering rules. */
  readonly onDrop: (event: DragDropEvent) => void
  readonly onDragStart?: (item: DragItemRef) => void
  readonly onDragEnd?: () => void
  readonly renderItem?: (item: T, index: number) => UiChild
  readonly itemLabel?: (item: T, index: number) => string
  readonly label?: string
  readonly emptyLabel?: string
}

/**
 * Pointer + keyboard sortable grid. It only reports `{from,to,itemId}`:
 * `to` is `sortableCellId(source, index)`; the caller decides what a move means.
 */
export function SortableGrid<T>(props: SortableGridProps<T>): UiNode {
  const [focusIndex, setFocusIndex] = createSignal(0)
  const [grabIndex, setGrabIndex] = createSignal<number | null>(null)
  const [targetIndex, setTargetIndex] = createSignal(0)
  const elements = new Map<number, HTMLElement>()
  const columns = () => Math.max(1, props.columns ?? 1)
  const items = () => readValue(props.items)

  const reset = (): void => {
    setGrabIndex(null)
    setTargetIndex(0)
  }
  const beginKeyboard = (index: number): void => {
    const item = items()[index]
    if (item === undefined) {
      return
    }
    const ref: DragItemRef = { itemId: props.itemId(item, index), from: props.source }
    beginDrag(ref)
    setGrabIndex(index)
    setTargetIndex(index)
    setFocusIndex(index)
    props.onDragStart?.(ref)
  }
  const commit = (index: number, notifyEnd: boolean): void => {
    const grab = grabIndex()
    const item = grab === null ? undefined : items()[grab]
    if (grab === null || item === undefined) {
      return
    }
    endDrag()
    reset()
    props.onDrop({
      itemId: props.itemId(item, grab),
      from: props.source,
      to: sortableCellId(props.source, index),
    })
    if (notifyEnd) {
      props.onDragEnd?.()
    }
  }
  const cancel = (): void => {
    if (grabIndex() !== null) {
      endDrag()
      reset()
      props.onDragEnd?.()
    }
  }
  const moveFocus = (next: number): void => {
    const total = items().length
    if (total === 0) {
      return
    }
    const index = Math.max(0, Math.min(next, total - 1))
    setFocusIndex(index)
    elements.get(index)?.focus()
  }
  const onKeyDown = (index: number, event: KeyboardEvent): void => {
    const total = items().length
    if (total === 0) {
      return
    }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      if (grabIndex() !== null) {
        commit(targetIndex(), true)
      } else {
        beginKeyboard(index)
      }
      return
    }
    if (event.key === 'Escape') {
      if (grabIndex() !== null) {
        event.preventDefault()
        cancel()
      }
      return
    }
    const step = columns()
    let delta: number
    if (event.key === 'ArrowLeft') {
      delta = -1
    } else if (event.key === 'ArrowRight') {
      delta = 1
    } else if (event.key === 'ArrowUp') {
      delta = -step
    } else if (event.key === 'ArrowDown') {
      delta = step
    } else if (event.key === 'Home') {
      event.preventDefault()
      if (grabIndex() !== null) {
        setTargetIndex(0)
      } else {
        moveFocus(0)
      }
      return
    } else if (event.key === 'End') {
      event.preventDefault()
      if (grabIndex() !== null) {
        setTargetIndex(total - 1)
      } else {
        moveFocus(total - 1)
      }
      return
    } else {
      return
    }
    event.preventDefault()
    if (grabIndex() !== null) {
      setTargetIndex(Math.max(0, Math.min(targetIndex() + delta, total - 1)))
    } else {
      moveFocus(index + delta)
    }
  }

  const cells = () =>
    items().map((item, index) => {
      const grabbing = () => grabIndex() === index
      const target = () => grabIndex() !== null && targetIndex() === index
      return html`<div class=${() => {
        const classes = ['lg-sortable__cell']
        if (grabbing()) {
          classes.push('lg-sortable__cell--grabbed')
        }
        if (target()) {
          classes.push('lg-sortable__cell--target')
        }
        return classes.join(' ')
      }}
        role="listitem"
        tabIndex=${() => (focusIndex() === index ? 0 : -1)}
        aria-label=${() => props.itemLabel?.(item, index) ?? ''}
        aria-grabbed=${() => String(grabbing())}
        data-index=${index}
        draggable="true"
        ref=${(node: HTMLElement) => {
          elements.set(index, node)
        }}
        onDragStart=${(event: Event) => {
          const ref: DragItemRef = { itemId: props.itemId(item, index), from: props.source }
          try {
            ;(event as DragEvent).dataTransfer?.setData('text/plain', ref.itemId)
          } catch {
            // Session state is authoritative; dataTransfer is only for native interop.
          }
          beginDrag(ref)
          setGrabIndex(index)
          setTargetIndex(index)
          setFocusIndex(index)
          props.onDragStart?.(ref)
        }}
        onDragOver=${(event: Event) => {
          if (currentDrag() !== null) {
            event.preventDefault()
            setTargetIndex(index)
          }
        }}
        onDrop=${(event: Event) => {
          if (currentDrag() !== null) {
            event.preventDefault()
            commit(index, false)
          }
        }}
        onDragEnd=${() => {
          endDrag()
          reset()
          props.onDragEnd?.()
        }}
        onKeyDown=${(event: KeyboardEvent) => onKeyDown(index, event)}>
        ${props.renderItem === undefined ? String(item) : props.renderItem(item, index)}
      </div>`
    })

  return html`<div class="lg-sortable" role="list" aria-label=${() => props.label ?? ''}
    style=${() => ({ gridTemplateColumns: `repeat(${columns()}, minmax(0, 1fr))` })}>
    ${() => {
      const list = items()
      if (list.length === 0) {
        return html`<div class="lg-sortable__empty">${props.emptyLabel ?? ''}</div>`
      }
      return cells()
    }}
  </div>`
}
