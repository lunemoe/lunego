import { createSignal } from 'solid-js'
import html from 'solid-js/html'
import { resolveText, type TextValue } from './text.js'
import { readValue, type UiNode, type UiValue } from './ui-types.js'

export interface GraphNodeData {
  readonly id: string
  /** Localized label supplied by the caller. */
  readonly label: TextValue
  readonly x: number
  readonly y: number
  readonly disabled?: boolean
  readonly icon?: string | null
}

export interface GraphEdgeData {
  readonly from: string
  readonly to: string
  /** Localized edge label supplied by the caller. */
  readonly label?: TextValue
}

export interface GraphViewProps {
  readonly nodes: UiValue<readonly GraphNodeData[]>
  readonly edges?: UiValue<readonly GraphEdgeData[]>
  readonly selected?: UiValue<string | null>
  readonly onSelect?: (id: string) => void
  readonly zoom?: UiValue<number>
  readonly onZoomChange?: (zoom: number) => void
  readonly minZoom?: number
  readonly maxZoom?: number
  readonly width?: number
  readonly height?: number
  readonly label?: TextValue
  /** Caller-owned description element id for `aria-describedby`. */
  readonly describedBy?: string
  /** Zoom controls are only rendered when their localized labels are provided. */
  readonly zoomInLabel?: TextValue
  readonly zoomOutLabel?: TextValue
  readonly resetLabel?: TextValue
}

function clampZoom(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Minimal node/edge graph with selection, roving keyboard focus, drag-to-pan and
 * wheel/+-/0 zoom. It never interprets node or edge semantics.
 */
export function GraphView(props: GraphViewProps): UiNode {
  const [internalSelected, setInternalSelected] = createSignal<string | null>(null)
  const [focusIndex, setFocusIndex] = createSignal(0)
  const [internalZoom, setInternalZoom] = createSignal(1)
  const [panX, setPanX] = createSignal(0)
  const [panY, setPanY] = createSignal(0)
  const elements = new Map<string, HTMLElement>()
  let dragging = false
  let lastX = 0
  let lastY = 0

  const minZoom = () => props.minZoom ?? 0.25
  const maxZoom = () => props.maxZoom ?? 4
  const zoom = () => clampZoom(
    props.zoom === undefined ? internalZoom() : readValue(props.zoom),
    minZoom(),
    maxZoom(),
  )
  const nodes = () => readValue(props.nodes)
  const selectedId = () =>
    props.selected === undefined ? internalSelected() : readValue(props.selected)
  const setZoom = (next: number): void => {
    const value = clampZoom(next, minZoom(), maxZoom())
    if (props.zoom === undefined) {
      setInternalZoom(value)
    }
    props.onZoomChange?.(value)
  }
  const select = (node: GraphNodeData): void => {
    if (node.disabled === true) {
      return
    }
    if (props.selected === undefined) {
      setInternalSelected(node.id)
    }
    props.onSelect?.(node.id)
  }
  const focusNode = (index: number): void => {
    const list = nodes()
    if (list.length === 0) {
      return
    }
    const next = Math.max(0, Math.min(index, list.length - 1))
    setFocusIndex(next)
    const node = list[next]
    if (node !== undefined) {
      elements.get(node.id)?.focus()
    }
  }
  const zoomInText = () => (props.zoomInLabel === undefined ? '' : resolveText(props.zoomInLabel))
  const zoomOutText = () => (props.zoomOutLabel === undefined ? '' : resolveText(props.zoomOutLabel))
  const resetText = () => (props.resetLabel === undefined ? '' : resolveText(props.resetLabel))
  const onKeyDown = (event: KeyboardEvent): void => {
    const total = nodes().length
    if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      setZoom(zoom() * 1.1)
    } else if (event.key === '-') {
      event.preventDefault()
      setZoom(zoom() / 1.1)
    } else if (event.key === '0') {
      event.preventDefault()
      setZoom(1)
      setPanX(0)
      setPanY(0)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setPanX(panX() + 12)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      setPanX(panX() - 12)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setPanY(panY() + 12)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setPanY(panY() - 12)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusNode(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusNode(total - 1)
    }
  }

  return html`<div class="lg-graph" role="group"
    aria-label=${() => (props.label === undefined ? '' : resolveText(props.label))}
    aria-describedby=${() => props.describedBy}>
    <div class="lg-graph__viewport"
      tabIndex="0"
      aria-describedby=${() => props.describedBy}
      onKeyDown=${(event: KeyboardEvent) => onKeyDown(event)}
      onWheel=${(event: WheelEvent) => {
        event.preventDefault()
        setZoom(event.deltaY < 0 ? zoom() * 1.1 : zoom() / 1.1)
      }}
      onPointerDown=${(event: PointerEvent) => {
        dragging = true
        lastX = event.clientX
        lastY = event.clientY
        ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
      }}
      onPointerMove=${(event: PointerEvent) => {
        if (!dragging) {
          return
        }
        setPanX(panX() + (event.clientX - lastX))
        setPanY(panY() + (event.clientY - lastY))
        lastX = event.clientX
        lastY = event.clientY
      }}
      onPointerUp=${() => {
        dragging = false
      }}
      onPointerCancel=${() => {
        dragging = false
      }}
      style=${{
        width: `${props.width ?? 320}px`,
        height: `${props.height ?? 240}px`,
        '--lg-graph-zoom': String(zoom()),
      }}>
      <div class="lg-graph__canvas"
        style=${() => ({
          transform: `translate(${panX()}px, ${panY()}px) scale(${zoom()})`,
        })}>
        <svg class="lg-graph__edges" aria-hidden="true">
          ${() =>
            readValue(props.edges ?? []).map((edge) => {
              const from = nodes().find((node) => node.id === edge.from)
              const to = nodes().find((node) => node.id === edge.to)
              if (from === undefined || to === undefined) {
                return null
              }
              return html`<g class="lg-graph__edge">
                <line x1=${from.x} y1=${from.y} x2=${to.x} y2=${to.y} />
                ${edge.label === undefined
                  ? null
                  : html`<text x=${(from.x + to.x) / 2} y=${(from.y + to.y) / 2}>${() => resolveText(edge.label as TextValue)}</text>`}
              </g>`
            })}
        </svg>
        ${() =>
          nodes().map((node, index) => {
            const hasIcon = node.icon !== undefined && node.icon !== null
            return html`<button type="button" class=${() =>
              selectedId() === node.id ? 'lg-graph__node lg-graph__node--selected' : 'lg-graph__node'}
              data-node-id=${node.id}
              aria-label=${() => resolveText(node.label)}
              aria-disabled=${() => String(node.disabled === true)}
              disabled=${node.disabled === true}
              tabIndex=${() => (focusIndex() === index ? 0 : -1)}
              ref=${(element: HTMLElement) => {
                elements.set(node.id, element)
              }}
              style=${{
                left: `${node.x}px`,
                top: `${node.y}px`,
              }}
              onClick=${() => select(node)}
              onKeyDown=${(event: KeyboardEvent) => {
                if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                  event.preventDefault()
                  event.stopPropagation()
                  focusNode(index + 1)
                } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                  event.preventDefault()
                  event.stopPropagation()
                  focusNode(index - 1)
                }
              }}>
              ${hasIcon
                ? html`<img class="lg-graph__icon" src=${node.icon} alt="" draggable="false" />`
                : null}
              <span class="lg-graph__label">${() => resolveText(node.label)}</span>
            </button>`
          })}
      </div>
    </div>
    ${() =>
      props.zoomInLabel === undefined && props.zoomOutLabel === undefined
        ? null
        : html`<div class="lg-graph__controls" role="toolbar">
            ${props.zoomInLabel === undefined
              ? null
              : html`<button type="button" class="lg-button"
                  aria-label=${() => zoomInText()}
                  onClick=${() => setZoom(zoom() * 1.1)}>${() => zoomInText()}</button>`}
            ${props.zoomOutLabel === undefined
              ? null
              : html`<button type="button" class="lg-button"
                  aria-label=${() => zoomOutText()}
                  onClick=${() => setZoom(zoom() / 1.1)}>${() => zoomOutText()}</button>`}
            ${props.resetLabel === undefined
              ? null
              : html`<button type="button" class="lg-button"
                  aria-label=${() => resetText()}
                  onClick=${() => {
                    setZoom(1)
                    setPanX(0)
                    setPanY(0)
                  }}>${() => resetText()}</button>`}
          </div>`}
  </div>`
}
