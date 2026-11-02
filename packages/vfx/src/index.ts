export { Effects, PIXELFX_SOURCE, type EffectName } from './catalog.js'
export {
  DEFAULT_PROJECTION,
  anchorFor,
  angleFromFacing,
  effectLayerTransform,
  effectScreenPosition,
  projectGround,
  type ProjectedPoint,
  type ScreenPoint,
} from './projection.js'
export { CanvasEffectSurface, type CanvasSurfaceOptions } from './surface.js'
export { CueEffectMap, VfxSystem, defineCueMap, type VfxConfig } from './system.js'
export { EFFECT_LAYER_RENDER_TARGET, EFFECT_LAYERS } from './types.js'
export type {
  CueResolver,
  EffectImpl,
  EffectInstance,
  EffectLayer,
  EffectMeta,
  EffectModule,
  EffectRequest,
  PixelFrame,
  TopDownProjection,
} from './types.js'
