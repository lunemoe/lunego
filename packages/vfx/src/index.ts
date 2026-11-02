export { Effects, PIXELFX_SOURCE, type EffectName } from './catalog.js'
export {
  DEFAULT_PROJECTION,
  anchorFor,
  angleFromFacing,
  projectGround,
  type ProjectedPoint,
} from './projection.js'
export { CanvasEffectSurface, type CanvasSurfaceOptions } from './surface.js'
export { CueEffectMap, VfxSystem, defineCueMap, type VfxConfig } from './system.js'
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
