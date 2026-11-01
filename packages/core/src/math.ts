/**
 * Software math for the logic layer. Only +, -, *, / and integer bit
 * operations are used for transcendental results, so results do not depend on
 * the host's libm. This is the zero-cost constraint that keeps lockstep
 * networking possible later.
 */

export const PI = 3.141592653589793
export const TAU = 6.283185307179586
export const HALF_PI = 1.5707963267948966
export const QUARTER_PI = 0.7853981633974483
export const E = 2.718281828459045
export const LN2 = 0.6931471805599453
export const LN10 = 2.302585092994046
export const SQRT2 = 1.4142135623730951

const TAN_PI_12 = 0.2679491924311227
const PI_12 = 0.2617993877991494

function sinPoly(x: number): number {
  const x2 = x * x
  return (
    x *
    (1 +
      x2 *
        (-1 / 6 +
          x2 *
            (1 / 120 +
              x2 *
                (-1 / 5040 +
                  x2 * (1 / 362880 + x2 * (-1 / 39916800 + x2 * (1 / 6227020800)))))))
  )
}

function cosPoly(x: number): number {
  const x2 = x * x
  return (
    1 +
    x2 *
      (-1 / 2 +
        x2 *
          (1 / 24 +
            x2 *
              (-1 / 720 +
                x2 * (1 / 40320 + x2 * (-1 / 3628800 + x2 * (1 / 479001600))))))
  )
}

export function sin(x: number): number {
  if (!Number.isFinite(x)) {
    return Number.NaN
  }
  const quadrant = Math.round(x / HALF_PI)
  const r = x - quadrant * HALF_PI
  const q = ((quadrant % 4) + 4) % 4
  if (q === 0) {
    return sinPoly(r)
  }
  if (q === 1) {
    return cosPoly(r)
  }
  if (q === 2) {
    return -sinPoly(r)
  }
  return -cosPoly(r)
}

export function cos(x: number): number {
  if (!Number.isFinite(x)) {
    return Number.NaN
  }
  const quadrant = Math.round(x / HALF_PI)
  const r = x - quadrant * HALF_PI
  const q = ((quadrant % 4) + 4) % 4
  if (q === 0) {
    return cosPoly(r)
  }
  if (q === 1) {
    return -sinPoly(r)
  }
  if (q === 2) {
    return -cosPoly(r)
  }
  return sinPoly(r)
}

export function tan(x: number): number {
  return sin(x) / cos(x)
}

function atanSeries(x: number): number {
  const x2 = x * x
  let term = x
  let sum = x
  for (let n = 3; n <= 43; n += 2) {
    term *= -x2
    sum += term / n
  }
  return sum
}

export function atan(x: number): number {
  if (Number.isNaN(x)) {
    return Number.NaN
  }
  if (x === 0) {
    return x
  }
  const sign = x < 0 ? -1 : 1
  const ax = x < 0 ? -x : x
  if (ax > 1) {
    return sign * (HALF_PI - atan(1 / ax))
  }
  if (ax > TAN_PI_12) {
    return sign * (PI_12 + atanSeries((ax - TAN_PI_12) / (1 + ax * TAN_PI_12)))
  }
  return sign * atanSeries(ax)
}

export function atan2(y: number, x: number): number {
  if (Number.isNaN(y) || Number.isNaN(x)) {
    return Number.NaN
  }
  if (y === 0) {
    return x >= 0 ? 0 : PI
  }
  if (x === 0) {
    return y > 0 ? HALF_PI : -HALF_PI
  }
  const base = atan(y / x)
  if (x > 0) {
    return base
  }
  return y > 0 ? base + PI : base - PI
}

function logSeries(z: number): number {
  const z2 = z * z
  let term = z
  let sum = z
  for (let n = 3; n <= 41; n += 2) {
    term *= z2
    sum += term / n
  }
  return 2 * sum
}

export function log(x: number): number {
  if (Number.isNaN(x) || x < 0) {
    return Number.NaN
  }
  if (x === 0) {
    return Number.NEGATIVE_INFINITY
  }
  if (x === Number.POSITIVE_INFINITY) {
    return Number.POSITIVE_INFINITY
  }
  let mantissa = x
  let exponent = 0
  while (mantissa >= 2) {
    mantissa *= 0.5
    exponent += 1
  }
  while (mantissa < 1) {
    mantissa *= 2
    exponent -= 1
  }
  const z = (mantissa - 1) / (mantissa + 1)
  return logSeries(z) + exponent * LN2
}

export function log2(x: number): number {
  return log(x) / LN2
}

export function log10(x: number): number {
  return log(x) / LN10
}

function pow2(exponent: number): number {
  if (exponent > 1023) {
    return Number.POSITIVE_INFINITY
  }
  if (exponent < -1074) {
    return 0
  }
  let result = 1
  if (exponent >= 0) {
    let base = 2
    let power = exponent
    while (power > 0) {
      if ((power & 1) === 1) {
        result *= base
      }
      base *= base
      power >>= 1
    }
    return result
  }
  let base = 0.5
  let power = -exponent
  while (power > 0) {
    if ((power & 1) === 1) {
      result *= base
    }
    base *= base
    power >>= 1
  }
  return result
}

function expSeries(x: number): number {
  let term = 1
  let sum = 1
  for (let n = 1; n <= 20; n += 1) {
    term *= x / n
    sum += term
  }
  return sum
}

export function exp(x: number): number {
  if (Number.isNaN(x)) {
    return Number.NaN
  }
  if (x === Number.POSITIVE_INFINITY) {
    return Number.POSITIVE_INFINITY
  }
  if (x === Number.NEGATIVE_INFINITY) {
    return 0
  }
  if (x > 709.782712893384) {
    return Number.POSITIVE_INFINITY
  }
  if (x < -745.1332191019411) {
    return 0
  }
  const exponent = Math.floor(x / LN2 + 0.5)
  const r = x - exponent * LN2
  return expSeries(r) * pow2(exponent)
}

export function pow(x: number, y: number): number {
  if (y === 0) {
    return 1
  }
  if (x === 1) {
    return 1
  }
  if (Number.isNaN(x) || Number.isNaN(y)) {
    return Number.NaN
  }
  if (x === 0) {
    return y > 0 ? 0 : Number.POSITIVE_INFINITY
  }
  if (x === Number.POSITIVE_INFINITY) {
    return y > 0 ? Number.POSITIVE_INFINITY : 0
  }
  if (x < 0) {
    if (!Number.isInteger(y)) {
      return Number.NaN
    }
    const magnitude = exp(y * log(-x))
    const odd = Math.abs(y % 2) === 1
    return odd ? -magnitude : magnitude
  }
  return exp(y * log(x))
}

export function sqrt(x: number): number {
  if (Number.isNaN(x) || x < 0) {
    return Number.NaN
  }
  if (x === 0) {
    return x
  }
  if (x === Number.POSITIVE_INFINITY) {
    return x
  }
  let mantissa = x
  let exponent = 0
  while (mantissa >= 4) {
    mantissa *= 0.25
    exponent += 1
  }
  while (mantissa < 1) {
    mantissa *= 4
    exponent -= 1
  }
  let guess = (mantissa + 1) / 2
  for (let i = 0; i < 30; i += 1) {
    guess = (guess + mantissa / guess) / 2
  }
  return guess * pow2(exponent)
}
