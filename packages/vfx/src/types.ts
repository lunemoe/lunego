import type { CueInstance } from '@lunego/core'

export interface EffectMeta {
  readonly name: string
  readonly desc?: string
  readonly tags?: readonly string[]
  readonly size: readonly [number, number]
  readonly origin: readonly [number, number]
  readonly duration: number
  readonly loop?: boolean
  readonly fps?: number
  readonly bg?: string
  readonly options?: Readonly<Record<string, unknown>>
}

export interface PixelFrame {
  readonly w: number
  readonly h: number
  readonly color: Uint32Array
  readonly light: Uint32Array
}

export interface EffectImpl {
  update?(dt: number, options: Readonly<Record<string, unknown>>): void
  draw?(painter: unknown, time: number, options: Readonly<Record<string, unknown>>): void
  drawBack?(painter: unknown, time: number, options: Readonly<Record<string, unknown>>): void
}

export interface EffectModule {
  readonly meta: EffectMeta
  readonly create?: (options: Readonly<Record<string, unknown>>) => EffectImpl
  readonly update?: (dt: number, options: Readonly<Record<string, unknown>>) => void
  readonly draw?: (painter: unknown, time: number, options: Readonly<Record<string, unknown>>) => void
  readonly drawBack?: (painter: unknown, time: number, options: Readonly<Record<string, unknown>>) => void
}

export interface EffectInstance {
  readonly meta: EffectMeta
  update(dt: number): void
  draw(frame: PixelFrame, layer: 'back' | 'front'): void
  stop(): void
  done(): boolean
}

/** Which render-pixi layer an effect belongs to; ground sits behind actors. */
export type EffectLayer = 'ground' | 'front'

export interface TopDownProjection {
  /** Vertical squash for effects lying on the floor plane. */
  readonly groundScaleY: number
  /** Horizontal shift per local Y unit; 0 keeps straight-down perspective. */
  readonly skewX: number
  /** Extra pixels below the anchor, for effects authored around the feet. */
  readonly footOffset: number
}

export interface EffectRequest {
  readonly effect: EffectModule
  readonly x: number
  readonly y: number
  readonly angle?: number
  readonly flip?: boolean
  readonly scale?: number
  readonly seed?: number
  readonly palette?: readonly string[]
  readonly light?: number
  readonly layer?: EffectLayer
  /** World-space offset from the feet anchor, before ground projection. */
  readonly offsetX?: number
  readonly offsetY?: number
  /** Shorthand: feet keeps (0,0); center moves the effect frame center to x/y. */
  readonly anchor?: 'feet' | 'center'
  readonly options?: Readonly<Record<string, unknown>>
}

export type CueResolver = (cue: CueInstance) => readonly EffectRequest[]
