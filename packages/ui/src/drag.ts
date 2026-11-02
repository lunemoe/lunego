import { createSignal } from 'solid-js'
import html from 'solid-js/html'
import { readValue, type UiChild, type UiNode, type UiValue } from './ui-types.js'

/** Minimal payload produced at drag start; no item rules are evaluated here. */
export interface DragItemRef {
  readonly itemId: string
  readonly from: string
}

/** Payload handed to a drop handler. `from`/`to` are caller-defined ids. */
export interface DragDropEvent {
  readonly itemId: string
  readonly from: string
  readonly to: string
}

interface DragSession extends DragItemRef {
  readonly x: number
  readonly y: number
}

const [session, setSession] = createSignal<DragSession | null>(null)

/** The item currently being dragged, or null. Shared by sources and targets. */
export function currentDrag(): DragItemRef | null {
  const value = session()
  return value === null ? null : { itemId: value.itemId, from: value.from }
}

/** Start a programmatic drag. Components normally call this from a source. */
export function beginDrag(item: DragItemRef): void {
  setSession({ itemId: item.itemId, from: item.from, x: 0, y: 0 })
}

/** Cancel or finish the active drag. */
export function endDrag(): void {
  if (session() !== null) {
    setSession(null)
  }
}

function moveDrag(x: number, y: number): void {
  const value = session()
  if (value !== null) {
    setSession({ itemId: value.itemId, from: value.from, x, y })
  }
}

/** Stable cell id used by SortableGrid drop events. */
export function sortableCellId(source: string, index: number): string {
  return `${source}/${index}`
}

function dragDataTransfer(event: Event): DataTransfer | null {
  const transfer = (event as DragEvent).dataTransfer
  return transfer === undefined || transfer === null ? null : transfer
}

export interface DragSourceProps {
  readonly itemId: string
  readonly from: string
  readonly disabled?: UiValue<boolean>
  /** Localized accessible label supplied by the caller. */
  readonly label?: string
  /** Optional preview rendered while this source is being dragged. */
  readonly preview?: UiValue<UiChild>
  readonly onDragStart?: (item: DragItemRef) => void
  readonly onDragEnd?: () => void
  readonly children: UiChild | (() => UiChild)
}

/**
 * Pointer/native-drag and keyboard drag source. Space/Enter picks up or drops,
 * Escape cancels; arrow-key traversal belongs to SortableGrid or the caller.
 */
export function DragSource(props: DragSourceProps): UiNode {
  const active = () => {
    const value = session()
    return value !== null && value.itemId === props.itemId && value.from === props.from
  }
  const disabled = () => readValue(props.disabled ?? false)
  const begin = (): void => {
    if (disabled()) {
      return
    }
    const item: DragItemRef = { itemId: props.itemId, from: props.from }
    beginDrag(item)
    props.onDragStart?.(item)
  }
  const finish = (): void => {
    const wasActive = active()
    endDrag()
    if (wasActive) {
      props.onDragEnd?.()
    }
  }
  return html`<div class=${() => (active() ? 'lg-drag lg-drag--active' : 'lg-drag')}
    role="button"
    tabIndex=${() => (disabled() ? -1 : 0)}
    aria-disabled=${() => String(disabled())}
    aria-grabbed=${() => String(active())}
    aria-label=${() => props.label ?? ''}
    draggable=${() => String(!disabled())}
    onDragStart=${(event: Event) => {
      const transfer = dragDataTransfer(event)
      try {
        transfer?.setData('text/plain', props.itemId)
        if (transfer !== null) {
          transfer.effectAllowed = 'move'
        }
      } catch {
        // Session state is authoritative; dataTransfer is only for native drop interop.
      }
      begin()
      moveDrag((event as DragEvent).clientX ?? 0, (event as DragEvent).clientY ?? 0)
    }}
    onDrag=${(event: Event) => {
      if (active()) {
        moveDrag((event as DragEvent).clientX ?? 0, (event as DragEvent).clientY ?? 0)
      }
    }}
    onDragEnd=${() => finish()}
    onKeyDown=${(event: KeyboardEvent) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        if (active()) {
          finish()
        } else {
          begin()
        }
      } else if (event.key === 'Escape' && active()) {
        event.preventDefault()
        finish()
      }
    }}>${props.children}${() => {
      const preview = props.preview
      if (preview === undefined || !active()) {
        return null
      }
      const position = session()
      return html`<div class="lg-drag-preview" aria-hidden="true"
        style=${{
          left: `${position?.x ?? 0}px`,
          top: `${position?.y ?? 0}px`,
        }}>${readValue(preview)}</div>`
    }}</div>`
}

export interface DropTargetProps {
  readonly target: string
  readonly onDrop: (event: DragDropEvent) => void
  readonly disabled?: UiValue<boolean>
  /** Make the target focusable so Enter/Space can commit a keyboard drag. */
  readonly focusable?: boolean
  readonly label?: string
  readonly children: UiChild | (() => UiChild)
}

/** Drop zone for pointer/native drags and for focused keyboard drags. */
export function DropTarget(props: DropTargetProps): UiNode {
  const [over, setOver] = createSignal(false)
  const disabled = () => readValue(props.disabled ?? false)
  const canDrop = () => !disabled() && currentDrag() !== null
  const drop = (): void => {
    const item = currentDrag()
    if (item === null || disabled()) {
      return
    }
    setOver(false)
    endDrag()
    props.onDrop({ itemId: item.itemId, from: item.from, to: props.target })
  }
  return html`<div class=${() => (over() ? 'lg-drop lg-drop--over' : 'lg-drop')}
    role=${() => (props.focusable === true ? 'button' : undefined)}
    tabIndex=${() => (props.focusable === true && !disabled() ? 0 : undefined)}
    aria-disabled=${() => (props.focusable === true ? String(disabled()) : undefined)}
    aria-label=${() => props.label ?? ''}
    data-drag-over=${() => String(over())}
    onDragOver=${(event: Event) => {
      if (canDrop()) {
        event.preventDefault()
        moveDrag((event as DragEvent).clientX ?? 0, (event as DragEvent).clientY ?? 0)
        setOver(true)
      }
    }}
    onDragEnter=${() => {
      if (canDrop()) {
        setOver(true)
      }
    }}
    onDragLeave=${() => setOver(false)}
    onDrop=${(event: Event) => {
      if (canDrop()) {
        event.preventDefault()
        drop()
      }
    }}
    onKeyDown=${(event: KeyboardEvent) => {
      if (props.focusable !== true) {
        return
      }
      if (event.key === ' ' || event.key === 'Enter') {
        if (canDrop()) {
          event.preventDefault()
          drop()
        }
      } else if (event.key === 'Escape') {
        endDrag()
        setOver(false)
      }
    }}>${props.children}</div>`
}
