import { UI_LAYERS } from './theme.js'

export interface OverlayWorldPoint {
  readonly x: number
  readonly y: number
}

export interface OverlayViewport {
  readonly cssScale: number
  readonly offsetX: number
  readonly offsetY: number
  worldToScreen(worldX: number, worldY: number): OverlayWorldPoint
}

export interface FloatingTextOptions {
  readonly x: number
  readonly y: number
  readonly text: string
  readonly color?: string
  readonly lifetimeSeconds?: number
  readonly crit?: boolean
}

export interface ProjectileOverlayOptions {
  readonly texture: string
  readonly from: OverlayWorldPoint
  readonly to: OverlayWorldPoint
  readonly durationSeconds: number
  readonly width?: number
  readonly height?: number
  readonly scale?: number
}

export interface EffectOverlayOptions {
  readonly maxNodes?: number
  readonly zIndex?: number
  /** Skip shake/flash and animation when true. */
  readonly reduceMotion?: boolean
}

interface ActiveOverlay {
  readonly element: HTMLElement
  readonly until: number
  update?(elapsed: number): void
  finish?(): void
}

function resolveRoot(root: Element | string): Element {
  if (typeof root !== 'string') {
    return root
  }
  if (typeof document === 'undefined') {
    throw new Error('EffectOverlay needs a DOM document or a concrete root element')
  }
  const element = document.querySelector(root)
  if (element === null) {
    throw new Error(`EffectOverlay root ${root} was not found`)
  }
  return element
}

function clientPoint(viewport: OverlayViewport, worldX: number, worldY: number): OverlayWorldPoint {
  const screen = viewport.worldToScreen(worldX, worldY)
  return {
    x: viewport.offsetX + screen.x * viewport.cssScale,
    y: viewport.offsetY + screen.y * viewport.cssScale,
  }
}

/**
 * Generic DOM overlay for floating labels, projectiles, flashes and shake.
 * It never runs its own RAF: call `update(view.elapsed)` from the host loop.
 * World positions always go through the supplied renderer viewport.
 */
export class EffectOverlay {
  private readonly root: Element
  private readonly maxNodes: number
  private reduceMotionValue: boolean
  private readonly active: ActiveOverlay[] = []
  private now = 0
  private destroyed = false

  constructor(root: Element | string, options: EffectOverlayOptions = {}) {
    this.root = resolveRoot(root)
    this.maxNodes = options.maxNodes ?? 128
    this.reduceMotionValue = options.reduceMotion ?? false
    if (!Number.isInteger(this.maxNodes) || this.maxNodes < 1) {
      throw new Error('EffectOverlay maxNodes must be a positive integer')
    }
    const style = (this.root as HTMLElement).style
    style.position = 'fixed'
    style.inset = '0'
    style.overflow = 'hidden'
    style.pointerEvents = 'none'
    style.zIndex = String(options.zIndex ?? UI_LAYERS.overlay)
  }

  get reduceMotion(): boolean {
    return this.reduceMotionValue
  }

  setReducedMotion(value: boolean): void {
    this.reduceMotionValue = value
  }

  get nodeCount(): number {
    return this.active.length
  }

  update(elapsedSeconds: number): void {
    if (this.destroyed) {
      return
    }
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < this.now) {
      return
    }
    this.now = elapsedSeconds
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const item = this.active[index]
      item.update?.(elapsedSeconds)
      if (elapsedSeconds >= item.until) {
        item.finish?.()
        item.element.remove()
        this.active.splice(index, 1)
      }
    }
  }

  floatingText(options: FloatingTextOptions, viewport: OverlayViewport): HTMLElement {
    const lifetime = options.lifetimeSeconds ?? 0.8
    const element = this.createElement('div', options.crit === true ? 'lg-fx-number lg-fx-number--crit' : 'lg-fx-number')
    element.textContent = options.text
    element.style.color = options.color ?? 'var(--lg-text)'
    this.place(element, viewport, options.x, options.y)
    this.addActive({
      element,
      until: this.now + lifetime,
      update: () => undefined,
    })
    return element
  }

  projectile(options: ProjectileOverlayOptions, viewport: OverlayViewport): HTMLElement {
    const element = this.createElement('img', 'lg-fx-projectile')
    ;(element as HTMLImageElement).src = options.texture
    ;(element as HTMLImageElement).alt = ''
    ;(element as HTMLImageElement).draggable = false
    const width = (options.width ?? 16) * (options.scale ?? 1)
    const height = (options.height ?? 16) * (options.scale ?? 1)
    element.style.width = `${width}px`
    element.style.height = `${height}px`
    const place = (elapsed: number): void => {
      const progress = Math.max(0, Math.min(1, (elapsed - started) / options.durationSeconds))
      this.place(
        element,
        viewport,
        options.from.x + (options.to.x - options.from.x) * progress,
        options.from.y + (options.to.y - options.from.y) * progress,
      )
    }
    const started = this.now
    place(this.now)
    this.addActive({
      element,
      until: this.now + options.durationSeconds,
      update: place,
    })
    return element
  }

  flash(color = 'var(--lg-text)', durationSeconds = 0.15): HTMLElement {
    const element = this.createElement('div', 'lg-fx-flash')
    element.style.background = color
    if (this.reduceMotionValue) {
      return element
    }
    const started = this.now
    this.addActive({
      element,
      until: started + durationSeconds,
      update: (elapsed) => {
        const progress = (elapsed - started) / durationSeconds >= 1 - 1e-9
          ? 1
          : Math.max(0, Math.min(1, (elapsed - started) / durationSeconds))
        element.style.opacity = String(1 - progress)
      },
    })
    return element
  }

  shake(target: Element | string, durationSeconds = 0.16): void {
    if (this.reduceMotionValue) {
      return
    }
    const element = typeof target === 'string'
      ? (typeof document === 'undefined' ? null : document.querySelector(target))
      : target
    if (element === null) {
      return
    }
    element.classList.add('lg-fx-shake')
    this.addActive({
      element: element as HTMLElement,
      until: this.now + durationSeconds,
      finish: () => element.classList.remove('lg-fx-shake'),
    })
  }

  clear(): void {
    for (const item of this.active) {
      item.finish?.()
      item.element.remove()
    }
    this.active.length = 0
  }

  destroy(): void {
    if (this.destroyed) {
      return
    }
    this.clear()
    this.destroyed = true
  }

  private createElement<Tag extends 'div' | 'img'>(tag: Tag, className: string): HTMLElement {
    if (typeof document === 'undefined') {
      throw new Error('EffectOverlay needs a DOM document')
    }
    const element = document.createElement(tag)
    element.className = className
    element.setAttribute('data-lunego-fx', '')
    return element
  }

  private place(
    element: HTMLElement,
    viewport: OverlayViewport,
    worldX: number,
    worldY: number,
  ): void {
    const point = clientPoint(viewport, worldX, worldY)
    element.style.position = 'absolute'
    element.style.left = `${point.x}px`
    element.style.top = `${point.y}px`
    element.style.transform = 'translate(-50%, -50%)'
  }

  private addActive(item: ActiveOverlay): void {
    this.root.appendChild(item.element)
    this.active.push(item)
    while (this.active.length > this.maxNodes) {
      const oldest = this.active.shift()
      oldest?.finish?.()
      oldest?.element.remove()
    }
  }
}
