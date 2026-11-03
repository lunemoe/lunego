export interface PointerEventLike {
  readonly clientX: number
  readonly clientY: number
  readonly button?: number
  readonly buttons?: number
  readonly pointerId?: number
  preventDefault?: () => void
}

export interface PointerTarget {
  /** Browser surfaces keep receiving release/cancel after the pointer leaves. */
  setPointerCapture?(pointerId: number): void
  addEventListener(
    type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel' | 'contextmenu',
    listener: (event: PointerEventLike) => void,
  ): void
  removeEventListener(
    type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel' | 'contextmenu',
    listener: (event: PointerEventLike) => void,
  ): void
}

export interface PointerPosition {
  readonly x: number
  readonly y: number
}

/**
 * Structural match for @lunego/render-pixi's ViewportTransform. Keeping it
 * structural avoids a view-package dependency while letting the renderer's
 * object be passed through unchanged.
 */
export interface ViewportTransform {
  /** CSS pixels per virtual pixel. */
  readonly cssScale: number
  /** CSS pixels per world pixel (cssScale * zoom). */
  readonly scale: number
  readonly offsetX: number
  readonly offsetY: number
  readonly cameraX: number
  readonly cameraY: number
  readonly camera: PointerPosition
  readonly zoom: number
  readonly pixelSnap: boolean
  worldToScreen(worldX: number, worldY: number): PointerPosition
  screenToWorld(screenX: number, screenY: number): PointerPosition
}

/**
 * Pointer state in view space and world space. The logic layer never imports
 * this: games translate pointer actions into Commands.
 */
export class PointerState {
  private screen: PointerPosition = { x: 0, y: 0 }
  private world: PointerPosition = { x: 0, y: 0 }
  private transform: ViewportTransform = identityViewport()
  private readonly down = new Set<number>()
  private readonly pressed = new Set<number>()
  private readonly released = new Set<number>()
  private readonly pointers = new Map<number, Set<number>>()

  get screenPosition(): PointerPosition {
    return this.screen
  }

  get worldPosition(): PointerPosition {
    return this.world
  }

  get viewport(): ViewportTransform {
    return this.transform
  }

  setViewport(transform: ViewportTransform): void {
    if (!Number.isFinite(transform.cssScale) || transform.cssScale <= 0) {
      throw new Error('pointer cssScale must be positive')
    }
    if (
      typeof transform.worldToScreen !== 'function' ||
      typeof transform.screenToWorld !== 'function'
    ) {
      throw new Error('pointer viewport must provide worldToScreen/screenToWorld')
    }
    this.transform = transform
    this.world = this.screenToWorld(this.screen)
  }

  screenToWorld(position: PointerPosition): PointerPosition {
    const screenX = (position.x - this.transform.offsetX) / this.transform.cssScale
    const screenY = (position.y - this.transform.offsetY) / this.transform.cssScale
    return this.transform.screenToWorld(screenX, screenY)
  }

  isDown(button = 0): boolean {
    return this.down.has(button)
  }

  wasPressed(button = 0): boolean {
    return this.pressed.has(button)
  }

  wasReleased(button = 0): boolean {
    return this.released.has(button)
  }

  get activeButtons(): readonly number[] {
    return [...this.down]
  }

  handleDown(event: PointerEventLike): boolean {
    const button = event.button ?? 0
    const pointer = event.pointerId ?? 0
    this.moveTo(event)
    const buttons = this.pointers.get(pointer) ?? new Set<number>()
    buttons.add(button)
    this.pointers.set(pointer, buttons)
    if (!this.down.has(button)) {
      this.down.add(button)
      this.pressed.add(button)
    }
    return true
  }

  handleMove(event: PointerEventLike): boolean {
    const pointer = event.pointerId ?? 0
    this.moveTo(event)
    if (event.buttons === undefined) {
      return true
    }
    const buttons = this.pointers.get(pointer)
    if (buttons === undefined) {
      return true
    }
    for (const button of [...buttons]) {
      if ((event.buttons & (1 << button)) === 0) {
        buttons.delete(button)
        if (!this.heldByOther(button, pointer)) {
          this.releaseButton(button)
        }
      }
    }
    return true
  }

  handleUp(event: PointerEventLike): boolean {
    const button = event.button ?? 0
    const pointer = event.pointerId ?? 0
    this.moveTo(event)
    const buttons = this.pointers.get(pointer)
    buttons?.delete(button)
    if (buttons !== undefined && buttons.size === 0) {
      this.pointers.delete(pointer)
    }
    if (!this.heldByOther(button, pointer)) {
      this.releaseButton(button)
    }
    return true
  }

  handleCancel(event: PointerEventLike): boolean {
    const pointer = event.pointerId ?? 0
    this.moveTo(event)
    const buttons = this.pointers.get(pointer)
    if (buttons !== undefined) {
      for (const button of [...buttons]) {
        if (!this.heldByOther(button, pointer)) {
          this.releaseButton(button)
        }
      }
      this.pointers.delete(pointer)
    }
    return true
  }

  /** Clear all pointers and buttons, preserving release edges for this frame. */
  releaseAll(): void {
    for (const button of this.down) {
      this.released.add(button)
    }
    this.down.clear()
    this.pressed.clear()
    this.pointers.clear()
  }

  private releaseButton(button: number): void {
    if (this.down.has(button)) {
      this.down.delete(button)
      this.released.add(button)
    }
  }

  private heldByOther(button: number, pointer: number): boolean {
    for (const [id, buttons] of this.pointers) {
      if (id !== pointer && buttons.has(button)) {
        return true
      }
    }
    return false
  }

  endFrame(): void {
    this.pressed.clear()
    this.released.clear()
  }

  private moveTo(event: PointerEventLike): void {
    this.screen = { x: event.clientX, y: event.clientY }
    this.world = this.screenToWorld(this.screen)
  }
}

function identityViewport(): ViewportTransform {
  return {
    cssScale: 1,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    cameraX: 0,
    cameraY: 0,
    camera: { x: 0, y: 0 },
    zoom: 1,
    pixelSnap: true,
    worldToScreen: (x, y) => ({ x, y }),
    screenToWorld: (x, y) => ({ x, y }),
  }
}
