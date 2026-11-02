import {
  PI,
  TAU,
  atan,
  atan2,
  cos,
  exp,
  log,
  log10,
  log2,
  pow,
  sin,
  sqrt,
  tan,
} from './math.js'
import type { MathService } from './context-types.js'

/** Deterministic math exposed to logic contexts as `ctx.math`. */
export const LOGIC_MATH: MathService = {
  PI,
  TAU,
  sin,
  cos,
  tan,
  atan,
  atan2,
  log,
  log2,
  log10,
  exp,
  pow,
  sqrt,
}
