import { createMemo, createSignal } from 'solid-js'
import html from 'solid-js/html'
import { readValue, type UiChild, type UiNode, type UiValue } from './ui-types.js'

export interface VirtualRangeInput {
  readonly count: number
  readonly rowHeight: number
  readonly viewportHeight: number
  readonly scrollTop: number
  readonly overscan?: number
}

export interface VirtualRange {
  /** First rendered row (inclusive). */
  readonly start: number
  /** Last rendered row (exclusive). */
  readonly end: number
  /** Pixel offset of the rendered window inside the scroll content. */
  readonly offset: number
  readonly totalHeight: number
}

/** Pure visible-window math; exported so lists can be tested without a DOM. */
export function virtualRange(input: VirtualRangeInput): VirtualRange {
  const count = Math.max(0, Math.floor(input.count))
  const rowHeight = Math.max(1, input.rowHeight)
  const viewport = Math.max(0, input.viewportHeight)
  const overscan = Math.max(0, Math.floor(input.overscan ?? 0))
  const maxScroll = Math.max(0, count * rowHeight - viewport)
  const scrollTop = Math.max(0, Math.min(input.scrollTop, maxScroll))
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const end = Math.min(count, Math.ceil((scrollTop + viewport) / rowHeight) + overscan)
  return {
    start,
    end,
    offset: start * rowHeight,
    totalHeight: count * rowHeight,
  }
}

export interface VirtualListProps<T> {
  readonly items: UiValue<readonly T[]>
  readonly rowHeight: number
  readonly height: number
  readonly overscan?: number
  readonly renderRow: (item: T, index: number) => UiChild
  readonly rowLabel?: (item: T, index: number) => string
  readonly onScroll?: (scrollTop: number) => void
  readonly label?: string
  readonly emptyLabel?: string
}

/** Fixed-height virtual list; only the visible window (plus overscan) is in the DOM. */
export function VirtualList<T>(props: VirtualListProps<T>): UiNode {
  const [scrollTop, setScrollTop] = createSignal(0)
  const range = createMemo(() =>
    virtualRange({
      count: readValue(props.items).length,
      rowHeight: props.rowHeight,
      viewportHeight: props.height,
      scrollTop: scrollTop(),
      overscan: props.overscan ?? 1,
    }),
  )
  const rows = createMemo(() => {
    const items = readValue(props.items)
    const current = range()
    const nodes: UiNode[] = []
    for (let index = current.start; index < current.end; index += 1) {
      const item = items[index]
      if (item === undefined) {
        continue
      }
      nodes.push(
        html`<div class="lg-vlist__row" role="listitem"
          aria-posinset=${index + 1}
          aria-setsize=${items.length}
          aria-label=${() => props.rowLabel?.(item, index) ?? ''}
          style=${{ height: `${props.rowHeight}px` }}>${props.renderRow(item, index)}</div>`,
      )
    }
    return nodes
  })
  return html`<div class="lg-vlist" role="list" aria-label=${() => props.label ?? ''}
    style=${{ height: `${props.height}px` }}
    onScroll=${(event: Event) => {
      const target = event.currentTarget as HTMLElement
      setScrollTop(target.scrollTop)
      props.onScroll?.(target.scrollTop)
    }}>
    <div class="lg-vlist__spacer" style=${() => ({ height: `${range().totalHeight}px` })}>
      <div class="lg-vlist__window" style=${() => ({ transform: `translateY(${range().offset}px)` })}>
        ${() => {
          if (readValue(props.items).length === 0) {
            return html`<div class="lg-vlist__empty">${props.emptyLabel ?? ''}</div>`
          }
          return rows()
        }}
      </div>
    </div>
  </div>`
}
