import { createEffect, createSignal, createUniqueId, onCleanup } from 'solid-js'
import html from 'solid-js/html'
import { render } from 'solid-js/web'
import type { UiChild, UiNode } from './ui-types.js'

export type TooltipPlacement = 'top' | 'bottom'

export interface TooltipRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface TooltipPlacementInput {
  readonly trigger: TooltipRect
  readonly content: { readonly width: number; readonly height: number }
  readonly viewport: { readonly width: number; readonly height: number }
  readonly placement?: TooltipPlacement
  readonly gap?: number
}

export interface TooltipPlacementResult {
  readonly left: number
  readonly top: number
  readonly placement: TooltipPlacement
}

/** Viewport-aware tooltip placement; flips when the preferred side overflows. */
export function placeTooltip(input: TooltipPlacementInput): TooltipPlacementResult {
  const gap = input.gap ?? 6
  const preferred = input.placement ?? 'top'
  const topAbove = input.trigger.y - input.content.height - gap
  const topBelow = input.trigger.y + input.trigger.height + gap
  const placement = preferred === 'top'
    ? (topAbove >= 0 || topBelow + input.content.height > input.viewport.height ? 'top' : 'bottom')
    : (topBelow + input.content.height <= input.viewport.height || topAbove < 0 ? 'bottom' : 'top')
  const rawTop = placement === 'top' ? topAbove : topBelow
  const maxLeft = Math.max(0, input.viewport.width - input.content.width)
  const left = Math.max(
    0,
    Math.min(input.trigger.x + input.trigger.width / 2 - input.content.width / 2, maxLeft),
  )
  const top = Math.max(0, Math.min(rawTop, Math.max(0, input.viewport.height - input.content.height)))
  return { left, top, placement }
}

export interface TooltipProps {
  readonly content: UiChild | null | (() => UiChild | null | undefined)
  readonly children: UiNode
  readonly placement?: TooltipPlacement
  /** Render into document.body (default) to avoid clipping/stacking contexts. */
  readonly portal?: boolean
  readonly id?: string
  readonly longPressMs?: number
}

export function Tooltip(props: TooltipProps): UiNode {
  const id = props.id ?? `lg-tip-${createUniqueId()}`
  const [open, setOpen] = createSignal(false)
  const portal = props.portal ?? true
  let wrapper: HTMLElement | undefined
  let content: HTMLElement | undefined
  let disposeContent: (() => void) | null = null
  let longPress: ReturnType<typeof setTimeout> | null = null

  const readContent = (): UiChild | null | undefined =>
    typeof props.content === 'function' ? props.content() : props.content

  const show = (): void => { setOpen(true) }
  const hide = (): void => { setOpen(false) }

  const position = (): void => {
    if (wrapper === undefined || content === undefined) {
      return
    }
    const trigger = wrapper.getBoundingClientRect()
    const box = content.getBoundingClientRect()
    const result = placeTooltip({
      trigger: { x: trigger.x, y: trigger.y, width: trigger.width, height: trigger.height },
      content: { width: box.width, height: box.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      ...(props.placement === undefined ? {} : { placement: props.placement }),
    })
    content.style.left = `${result.left}px`
    content.style.top = `${result.top}px`
    content.setAttribute('data-placement', result.placement)
  }

  if (portal) {
    createEffect(() => {
      if (typeof document === 'undefined') {
        return
      }
      const root = document.createElement('div')
      root.className = 'lg-tooltip__portal'
      document.body.appendChild(root)
      const node = document.createElement('div')
      node.className = 'lg-tooltip__content'
      node.id = id
      node.setAttribute('role', 'tooltip')
      root.appendChild(node)
      content = node
      disposeContent = render(() => html`<span>${readContent() ?? ''}</span>` as Node, node)
      onCleanup(() => {
        disposeContent?.()
        root.remove()
        content = undefined
      })
    })
  }

  createEffect(() => {
    const isOpen = open()
    if (content !== undefined) {
      content.style.display = isOpen ? 'block' : 'none'
      content.setAttribute('data-open', String(isOpen))
      if (isOpen) {
        position()
      }
    }
    if (!isOpen || typeof document === 'undefined') {
      return
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        hide()
      }
    }
    document.addEventListener('keydown', onKey)
    onCleanup(() => document.removeEventListener('keydown', onKey))
  })

  onCleanup(() => {
    if (longPress !== null) {
      clearTimeout(longPress)
    }
  })

  return html`<span class="lg-tooltip" ref=${(node: HTMLElement) => { wrapper = node }}
    aria-describedby=${id}
    onMouseEnter=${show}
    onMouseLeave=${hide}
    onFocusIn=${show}
    onFocusOut=${hide}
    onPointerDown=${() => {
      longPress = setTimeout(show, props.longPressMs ?? 450)
    }}
    onPointerUp=${() => {
      if (longPress !== null) {
        clearTimeout(longPress)
        longPress = null
      }
    }}
    onPointerCancel=${() => {
      if (longPress !== null) {
        clearTimeout(longPress)
        longPress = null
      }
    }}>
    ${props.children}
    ${portal
      ? null
      : html`<span class="lg-tooltip__content" id=${id} role="tooltip"
          style=${() => ({ display: open() ? 'block' : 'none' })}>${readContent() ?? ''}</span>`}
  </span>`
}
