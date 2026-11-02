export interface CameraPoint {
  readonly x: number
  readonly y: number
}

export interface CameraBounds {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

export interface CameraControllerOptions {
  readonly width: number
  readonly height: number
  readonly zoom?: number
  readonly bounds?: CameraBounds
  readonly pixelSnap?: boolean
  readonly offsetX?: number
  readonly offsetY?: number
}

/** Follow camera in world coordinates; uses the same rounding as render-pixi. */
export class CameraController {
  readonly width: number
  readonly height: number
  private zoomValue: number
  private boundsValue: CameraBounds | null
  private readonly pixelSnap: boolean
  private readonly offsetX: number
  private readonly offsetY: number
  private cameraX = 0
  private cameraY = 0

  constructor(options: CameraControllerOptions) {
    if (!Number.isFinite(options.width) || options.width <= 0 || !Number.isFinite(options.height) || options.height <= 0) {
      throw new Error('camera width/height must be positive')
    }
    if (!Number.isFinite(options.zoom ?? 1) || (options.zoom ?? 1) <= 0) {
      throw new Error('camera zoom must be positive')
    }
    this.width = options.width
    this.height = options.height
    this.zoomValue = options.zoom ?? 1
    this.boundsValue = options.bounds ?? null
    this.pixelSnap = options.pixelSnap ?? true
    this.offsetX = options.offsetX ?? 0
    this.offsetY = options.offsetY ?? 0
  }

  get zoom(): number {
    return this.zoomValue
  }

  get bounds(): CameraBounds | null {
    return this.boundsValue
  }

  get camera(): CameraPoint {
    return { x: this.cameraX, y: this.cameraY }
  }

  setZoom(zoom: number): void {
    if (!Number.isFinite(zoom) || zoom <= 0) {
      throw new Error('camera zoom must be positive')
    }
    this.zoomValue = zoom
  }

  setBounds(bounds: CameraBounds | null): void {
    this.boundsValue = bounds
  }

  follow(target: CameraPoint): CameraPoint {
    const viewWidth = this.width / this.zoomValue
    const viewHeight = this.height / this.zoomValue
    let x = target.x + this.offsetX - viewWidth / 2
    let y = target.y + this.offsetY - viewHeight / 2
    const bounds = this.boundsValue
    if (bounds !== null) {
      x = Math.max(bounds.minX, Math.min(x, Math.max(bounds.minX, bounds.maxX - viewWidth)))
      y = Math.max(bounds.minY, Math.min(y, Math.max(bounds.minY, bounds.maxY - viewHeight)))
    }
    if (this.pixelSnap) {
      x = Math.round(x * this.zoomValue) / this.zoomValue
      y = Math.round(y * this.zoomValue) / this.zoomValue
    }
    this.cameraX = x
    this.cameraY = y
    return { x, y }
  }
}

export function followCamera(
  target: CameraPoint,
  options: CameraControllerOptions,
): CameraPoint {
  return new CameraController(options).follow(target)
}
