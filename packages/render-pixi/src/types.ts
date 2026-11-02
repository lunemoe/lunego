import type {
  ComponentDef,
  DeepReadonly,
  Entity,
  QueryArg,
  SchemaShape,
  SchemaValue,
  TagDef,
  Vec2,
  AnyTypeDef,
} from '@lunego/core'

export type RenderLayer = 'background' | 'tiles' | 'entities' | 'foreground'

export const RENDER_LAYERS: readonly RenderLayer[] = [
  'background',
  'tiles',
  'entities',
  'foreground',
]

/** A frame inside a spritesheet texture, in source pixels. */
export interface SpriteFrame {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type TextureId = string

export interface DisplayTransform {
  /** World position of the anchor point. */
  x: number
  y: number
  visible: boolean
  alpha: number
  /** Normalized anchor inside the display object, 0..1. */
  anchorX?: number
  anchorY?: number
  flipX?: boolean
  flipY?: boolean
  /** RGB tint; 0xffffff keeps the source colors. */
  tint?: number
  /** Round world position to whole virtual pixels (default true). */
  pixelSnap?: boolean
}

export interface RectDisplaySpec extends DisplayTransform {
  readonly kind: 'rect'
  width: number
  height: number
  color: number
}

export interface SpriteDisplaySpec extends DisplayTransform {
  readonly kind: 'sprite'
  texture: TextureId
  /** Optional sub-rectangle of the texture. */
  frame?: SpriteFrame
  width?: number
  height?: number
}

export interface AnimatedDisplaySpec extends DisplayTransform {
  readonly kind: 'animated'
  texture: TextureId
  /** Frames in playback order; falls back to the texture's registered frames. */
  frames?: readonly SpriteFrame[]
  width?: number
  height?: number
  fps: number
  loop: boolean
  /** Explicit frame override, usually set from a component field. */
  frame?: number
}

export interface BackgroundDisplaySpec {
  readonly kind: 'background'
  color?: number
  texture?: TextureId
  tint?: number
  alpha?: number
}

export type EntityDisplaySpec =
  | RectDisplaySpec
  | SpriteDisplaySpec
  | AnimatedDisplaySpec

/** Backward-compatible name for entity display specs; backgrounds are separate. */
export type DisplaySpec = EntityDisplaySpec

export interface DisplayBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type DisplayAnchor = 'feet' | 'center' | 'top'

export interface RenderSource {
  readonly alpha: number
  entities(...args: QueryArg[]): readonly Entity[]
  get<S extends SchemaShape>(
    entity: Entity,
    component: ComponentDef<S>,
  ): DeepReadonly<SchemaValue<S>> | undefined
  prev<S extends SchemaShape>(
    entity: Entity,
    component: ComponentDef<S>,
  ): DeepReadonly<SchemaValue<S>> | undefined
  has(entity: Entity, target: ComponentDef | TagDef): boolean
}

export interface EntityView {
  readonly entity: Entity
  readonly alpha: number
  get<S extends SchemaShape>(component: ComponentDef<S>): DeepReadonly<SchemaValue<S>> | undefined
  prev<S extends SchemaShape>(component: ComponentDef<S>): DeepReadonly<SchemaValue<S>> | undefined
  has(target: ComponentDef | TagDef): boolean
  lerp(component: ComponentDef<{ readonly x: AnyTypeDef; readonly y: AnyTypeDef }>): Vec2
}

export interface RenderBinding {
  readonly query: readonly (ComponentDef | TagDef)[]
  readonly layer?: RenderLayer
  readonly sortByY?: boolean
  create(view: EntityView): EntityDisplaySpec
  update(object: EntityDisplaySpec, view: EntityView): void
  destroy?(object: DisplaySpec, view: EntityView): void
}

export interface RenderAdapter<Handle> {
  create(spec: EntityDisplaySpec): Handle
  update(handle: Handle, spec: EntityDisplaySpec, time?: number): void
  destroy(handle: Handle): void
  attach(layer: RenderLayer, handle: Handle): void
  detach(handle: Handle): void
  order(layer: RenderLayer, handles: readonly Handle[]): void
  setCamera(x: number, y: number): void
  /** Resolved world-space AABB after `update`; used for anchors and bounds. */
  measure?(spec: EntityDisplaySpec, time?: number): DisplayBounds
}

export function defineRenderBinding(binding: RenderBinding): RenderBinding {
  return binding
}

export function rectSpec(
  width: number,
  height: number,
  color: number,
): RectDisplaySpec {
  return {
    kind: 'rect',
    x: 0,
    y: 0,
    width,
    height,
    color,
    visible: true,
    alpha: 1,
  }
}

export interface SpriteOptions {
  readonly frame?: SpriteFrame
  readonly width?: number
  readonly height?: number
  readonly anchorX?: number
  readonly anchorY?: number
  readonly flipX?: boolean
  readonly flipY?: boolean
  readonly tint?: number
  readonly alpha?: number
  readonly visible?: boolean
  readonly pixelSnap?: boolean
}

export function spriteSpec(texture: TextureId, options: SpriteOptions = {}): SpriteDisplaySpec {
  return {
    kind: 'sprite',
    texture,
    x: 0,
    y: 0,
    visible: options.visible ?? true,
    alpha: options.alpha ?? 1,
    ...(options.frame === undefined ? {} : { frame: options.frame }),
    ...(options.width === undefined ? {} : { width: options.width }),
    ...(options.height === undefined ? {} : { height: options.height }),
    ...(options.anchorX === undefined ? {} : { anchorX: options.anchorX }),
    ...(options.anchorY === undefined ? {} : { anchorY: options.anchorY }),
    ...(options.flipX === undefined ? {} : { flipX: options.flipX }),
    ...(options.flipY === undefined ? {} : { flipY: options.flipY }),
    ...(options.tint === undefined ? {} : { tint: options.tint }),
    ...(options.pixelSnap === undefined ? {} : { pixelSnap: options.pixelSnap }),
  }
}

export interface AnimationOptions extends Omit<SpriteOptions, 'frame'> {
  readonly frames?: readonly SpriteFrame[]
  readonly fps?: number
  readonly loop?: boolean
  readonly frame?: number
}

export function animatedSpec(
  texture: TextureId,
  options: AnimationOptions = {},
): AnimatedDisplaySpec {
  return {
    kind: 'animated',
    texture,
    x: 0,
    y: 0,
    visible: options.visible ?? true,
    alpha: options.alpha ?? 1,
    fps: options.fps ?? 10,
    loop: options.loop ?? true,
    ...(options.frames === undefined ? {} : { frames: options.frames }),
    ...(options.frame === undefined ? {} : { frame: options.frame }),
    ...(options.width === undefined ? {} : { width: options.width }),
    ...(options.height === undefined ? {} : { height: options.height }),
    ...(options.anchorX === undefined ? {} : { anchorX: options.anchorX }),
    ...(options.anchorY === undefined ? {} : { anchorY: options.anchorY }),
    ...(options.flipX === undefined ? {} : { flipX: options.flipX }),
    ...(options.flipY === undefined ? {} : { flipY: options.flipY }),
    ...(options.tint === undefined ? {} : { tint: options.tint }),
    ...(options.pixelSnap === undefined ? {} : { pixelSnap: options.pixelSnap }),
  }
}

export function backgroundSpec(
  options: Omit<BackgroundDisplaySpec, 'kind'> = {},
): BackgroundDisplaySpec {
  return {
    kind: 'background',
    ...(options.color === undefined ? {} : { color: options.color }),
    ...(options.texture === undefined ? {} : { texture: options.texture }),
    ...(options.tint === undefined ? {} : { tint: options.tint }),
    ...(options.alpha === undefined ? {} : { alpha: options.alpha }),
  }
}

export interface SheetGridOptions {
  readonly frameWidth: number
  readonly frameHeight: number
  readonly columns: number
  readonly count: number
  readonly startX?: number
  readonly startY?: number
  readonly spacing?: number
  readonly margin?: number
}

export function sheetFrames(options: SheetGridOptions): SpriteFrame[] {
  const frames: SpriteFrame[] = []
  const spacing = options.spacing ?? 0
  const margin = options.margin ?? 0
  const startX = options.startX ?? margin
  const startY = options.startY ?? margin
  for (let index = 0; index < options.count; index += 1) {
    const column = index % options.columns
    const row = Math.floor(index / options.columns)
    frames.push({
      x: startX + column * (options.frameWidth + spacing),
      y: startY + row * (options.frameHeight + spacing),
      width: options.frameWidth,
      height: options.frameHeight,
    })
  }
  return frames
}

/** Pure frame selection used by the Pixi adapter and safe to unit test. */
export function animationFrameAt(
  spec: AnimatedDisplaySpec,
  frames: readonly SpriteFrame[],
  time: number,
): SpriteFrame | undefined {
  if (frames.length === 0) {
    return undefined
  }
  if (spec.frame !== undefined) {
    return frames[Math.max(0, Math.min(frames.length - 1, Math.floor(spec.frame)))]
  }
  const rate = Number.isFinite(spec.fps) && spec.fps > 0 ? spec.fps : 1
  const raw = Math.floor(Math.max(0, time) * rate)
  const index = spec.loop ? raw % frames.length : Math.min(frames.length - 1, raw)
  return frames[index]
}
