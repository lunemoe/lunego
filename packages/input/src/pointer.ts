export interface PointerEventLike {
  readonly clientX: number
  readonly clientY: number
  readonly button?: number
  readonly buttons?: number
  readonly pointerId?: number
  preventDefault?: () => void
}

export interface PointerTarget {
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

export interface ViewportTransform {
  /** CSS pixels per virtual/world pixel. */
  readonly scale: number
  /** Canvas top-left in client coordinates. */
  readonly offsetX: number
  readonly offsetY: number
  readonly cameraX: number
  readonly cameraY: number
}

/**
 * Pointer state in view space and world space. The logic layer never imports
 * this: games translate pointer actions into Commands.
 */
export class PointerState {
  private screen: PointerPosition = { x: 0, y: 0 }
  private world: PointerPosition = { x: 0, y: 0 }
  private transform: ViewportTransform = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    cameraX: 0,
    cameraY: 0,
  }
  private readonly down = new Set<number>()
  private readonly pressed = new Set<number>()
  private readonly released = new Set<number>()

  get screenPosition(): PointerPosition {
    return this.screen
  }

  get worldPosition(): PointerPosition {
    return this.world
  }

  get viewport(): ViewportTransform {
    return this.transform
  }

  setViewport(transform: Partial<ViewportTransform>): void {
    const scale = transform.scale ?? this.transform.scale
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new Error('pointer scale must be positive')
    }
    this.transform = {
      scale,
      offsetX: transform.offsetX ?? this.transform.offsetX,
      offsetY: transform.offsetY ?? this.transform.offsetY,
      cameraX: transform.cameraX ?? this.transform.cameraX,
      cameraY: transform.cameraY ?? this.transform.cameraY,
    }
    this.world = this.screenToWorld(this.screen)
  }

  setCamera(x: number, y: number): void {
    this.setViewport({ cameraX: x, cameraY: y })
  }

  screenToWorld(position: PointerPosition): PointerPosition {
    return {
      x: this.transform.cameraX + (position.x - this.transform.offsetX) / this.transform.scale,
      y: this.transform.cameraY + (position.y - this.transform.offsetY) / this.transform.scale,
    }
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
    this.moveTo(event)
    if (!this.down.has(button)) {
      this.down.add(button)
      this.pressed.add(button)
    }
    return true
  }

  handleMove(event: PointerEventLike): boolean {
    this.moveTo(event)
    if (event.buttons !== undefined) {
      for (const button of [...this.down]) {
        if ((event.buttons & (1 << button)) === 0) {
          this.down.delete(button)
          this.released.add(button)
        }
      }
    }
    return true
  }

  handleUp(event: PointerEventLike): boolean {
    const button = event.button ?? 0
    this.moveTo(event)
    if (this.down.has(button)) {
      this.down.delete(button)
      this.released.add(button)
    }
    return true
  }

  handleCancel(event: PointerEventLike): boolean {
    this.moveTo(event)
    for (const button of [...this.down]) {
      this.released.add(button)
    }
    this.down.clear()
    return true
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
