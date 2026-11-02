import { createMemo } from 'solid-js'
import html from 'solid-js/html'
import { resolveText, type TextValue } from './text.js'
import { readValue, type UiNode, type UiValue } from './ui-types.js'

export interface MinimapMapSize {
  readonly width: number
  readonly height: number
}

export interface MinimapViewport {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface MinimapPoint {
  readonly x: number
  readonly y: number
}

export interface MinimapProjectionInput {
  readonly map: MinimapMapSize
  /** Square minimap edge length in CSS pixels. */
  readonly size: number
  readonly padding?: number
  /** World-space region to show; defaults to the whole map. */
  readonly viewport?: MinimapViewport | null
}

export interface MinimapProjectionResult {
  readonly x: number
  readonly y: number
  readonly visible: boolean
}

/**
 * Project a world point into minimap pixels. The map keeps its aspect ratio and
 * is centered inside the square; points outside the region clamp to its edge.
 */
export function projectMinimapPoint(
  point: MinimapPoint,
  input: MinimapProjectionInput,
): MinimapProjectionResult {
  const padding = Math.max(0, input.padding ?? 0)
  const area = Math.max(0, input.size - padding * 2)
  const region = input.viewport ?? {
    x: 0,
    y: 0,
    width: input.map.width,
    height: input.map.height,
  }
  if (area <= 0 || region.width <= 0 || region.height <= 0) {
    return { x: padding, y: padding, visible: false }
  }
  const scale = Math.min(area / region.width, area / region.height)
  const drawWidth = region.width * scale
  const drawHeight = region.height * scale
  const originX = padding + (area - drawWidth) / 2
  const originY = padding + (area - drawHeight) / 2
  const rawX = originX + (point.x - region.x) * scale
  const rawY = originY + (point.y - region.y) * scale
  const visible =
    point.x >= region.x &&
    point.x <= region.x + region.width &&
    point.y >= region.y &&
    point.y <= region.y + region.height
  return {
    x: Math.max(padding, Math.min(padding + area, rawX)),
    y: Math.max(padding, Math.min(padding + area, rawY)),
    visible,
  }
}

export interface MinimapMarker extends MinimapPoint {
  readonly id: string
  /** Localized accessible label / tooltip supplied by the caller. */
  readonly label?: TextValue
  readonly icon?: string | null
  /** Any CSS color or caller theme token such as `var(--lg-accent)`. */
  readonly color?: string
}

export interface MinimapPlayer extends MinimapPoint {
  /** Degrees clockwise, supplied by the caller. */
  readonly rotation?: number
}

export interface MinimapViewProps {
  readonly map: UiValue<MinimapMapSize>
  readonly markers: UiValue<readonly MinimapMarker[]>
  readonly player?: UiValue<MinimapPlayer | null>
  readonly viewport?: UiValue<MinimapViewport | null>
  readonly size?: number
  readonly padding?: number
  /** Hard render cap; markers beyond it are not mounted. Defaults to 64. */
  readonly maxMarkers?: number
  readonly onMarkerClick?: (id: string) => void
  readonly label?: TextValue
  readonly describedBy?: string
}

/** DOM minimap: projection, marker cap, optional player arrow and marker clicks. */
export function MinimapView(props: MinimapViewProps): UiNode {
  const size = () => props.size ?? 160
  const padding = () => props.padding ?? 0
  const rendered = createMemo(() =>
    readValue(props.markers)
      .slice(0, Math.max(0, props.maxMarkers ?? 64))
      .map((marker) => ({
        marker,
        point: projectMinimapPoint(marker, {
          map: readValue(props.map),
          size: size(),
          padding: padding(),
          viewport: props.viewport === undefined ? null : readValue(props.viewport),
        }),
      })),
  )
  const project = (point: MinimapPoint): MinimapProjectionResult =>
    projectMinimapPoint(point, {
      map: readValue(props.map),
      size: size(),
      padding: padding(),
      viewport: props.viewport === undefined ? null : readValue(props.viewport),
    })
  return html`<div class="lg-minimap" role="group"
    aria-label=${() => (props.label === undefined ? '' : resolveText(props.label))}
    aria-describedby=${() => props.describedBy}
    style=${{
      width: `${size()}px`,
      height: `${size()}px`,
      '--lg-minimap-size': `${size()}px`,
    }}>
    ${() =>
      rendered().map(({ marker, point }) => {
        return html`<button type="button" class="lg-minimap__marker"
          data-marker-id=${marker.id}
          data-visible=${String(point.visible)}
          aria-label=${() => (marker.label === undefined ? '' : resolveText(marker.label))}
          title=${() => (marker.label === undefined ? '' : resolveText(marker.label))}
          style=${{
            left: `${point.x}px`,
            top: `${point.y}px`,
            background: marker.color ?? 'var(--lg-accent)',
          }}
          onClick=${() => props.onMarkerClick?.(marker.id)}>
          ${marker.icon === undefined || marker.icon === null
            ? null
            : html`<img class="lg-minimap__icon" src=${marker.icon} alt="" draggable="false" />`}
        </button>`
      })}
    ${() => {
      const player = props.player === undefined ? null : readValue(props.player)
      if (player === null || player === undefined) {
        return null
      }
      const point = project(player)
      return html`<div class="lg-minimap__player" aria-hidden="true"
        style=${{
          left: `${point.x}px`,
          top: `${point.y}px`,
          transform: `translate(-50%, -50%) rotate(${player.rotation ?? 0}deg)`,
        }}></div>`
    }}
  </div>`
}
