import { describe, expect, it } from 'vitest'
import {
  atan,
  atan2,
  cos,
  exp,
  log,
  PI,
  pow,
  sin,
  sqrt,
  tan,
} from '../math.js'

function approximately(actual: number, expected: number, tolerance: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
}

describe('software math', () => {
  it('matches libm for sin, cos and tan within tolerance', () => {
    for (let index = -100; index <= 100; index += 1) {
      const value = index / 7
      approximately(sin(value), Math.sin(value), 1e-9)
      approximately(cos(value), Math.cos(value), 1e-9)
    }
    approximately(tan(PI / 4), 1, 1e-9)
    approximately(tan(-PI / 3), Math.tan(-PI / 3), 1e-9)
  })

  it('matches libm for atan and atan2 in all quadrants', () => {
    for (let index = -100; index <= 100; index += 1) {
      const value = index / 11
      approximately(atan(value), Math.atan(value), 1e-9)
    }
    const points: ReadonlyArray<readonly [number, number]> = [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
      [2, -3],
    ]
    for (const [y, x] of points) {
      approximately(atan2(y, x), Math.atan2(y, x), 1e-9)
    }
  })

  it('matches libm for exp, log, pow and sqrt', () => {
    for (let index = -100; index <= 100; index += 1) {
      const value = index / 10
      approximately(exp(value), Math.exp(value), Math.max(1e-12, Math.abs(Math.exp(value)) * 1e-9))
      if (value > 0) {
        approximately(log(value), Math.log(value), 1e-9)
      }
    }
    approximately(exp(0), 1, 0)
    approximately(log(1), 0, 1e-12)
    approximately(pow(2, 10), 1024, 1e-9)
    approximately(pow(2, -3), 0.125, 1e-12)
    approximately(pow(-2, 3), -8, 1e-9)
    expect(Number.isNaN(pow(-2, 0.5))).toBe(true)
    approximately(sqrt(2), Math.SQRT2, 1e-12)
    approximately(sqrt(1e-300), Math.sqrt(1e-300), 1e-15)
    approximately(sqrt(1e300), Math.sqrt(1e300), 1e-12)
  })

  it('matches IEEE edge cases for atan2 and pow', () => {
    const edges: ReadonlyArray<readonly [number, number]> = [
      [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
      [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
      [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY],
      [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
      [0, 1],
      [-0, 1],
      [0, -1],
      [-0, -1],
      [1, Number.POSITIVE_INFINITY],
      [1, Number.NEGATIVE_INFINITY],
      [Number.POSITIVE_INFINITY, 1],
      [Number.NEGATIVE_INFINITY, 1],
    ]
    for (const [y, x] of edges) {
      expect(Object.is(atan2(y, x), Math.atan2(y, x))).toBe(true)
    }
    expect(Object.is(atan2(-0, 1), -0)).toBe(true)
    expect(Object.is(pow(-0, -3), Number.NEGATIVE_INFINITY)).toBe(true)
    expect(Object.is(pow(-0, 3), -0)).toBe(true)
    expect(Object.is(pow(-0, -2), Number.POSITIVE_INFINITY)).toBe(true)
    expect(pow(1, Number.NaN)).toBeNaN()
    expect(pow(1, Number.POSITIVE_INFINITY)).toBeNaN()
    expect(pow(-1, Number.POSITIVE_INFINITY)).toBeNaN()
    expect(pow(-Infinity, 0.5)).toBe(Number.POSITIVE_INFINITY)
    expect(pow(-Infinity, -0.5)).toBe(0)
    expect(pow(-Infinity, 3)).toBe(Number.NEGATIVE_INFINITY)
  })

  it('reduces large trigonometric arguments and declares the domain', () => {
    for (const value of [1e6, 123456789, 1e9, -987654321]) {
      approximately(sin(value), Math.sin(value), 1e-6)
      approximately(cos(value), Math.cos(value), 1e-6)
    }
    expect(sin(Number.MAX_VALUE)).toBeNaN()
    expect(cos(Number.MAX_VALUE)).toBeNaN()
    expect(sin(Infinity)).toBeNaN()
    expect(cos(-Infinity)).toBeNaN()
  })

  it('returns the subnormal exp boundary and rejects smaller values', () => {
    const boundary = exp(-745)
    expect(boundary).toBeGreaterThan(0)
    expect(boundary).toBeLessThanOrEqual(Number.MIN_VALUE * 2)
    expect(exp(-746)).toBe(0)
  })

  it('is bit-for-bit repeatable', () => {
    const values = [0.1, 1.2345, -3.7, 100.25]
    for (const value of values) {
      expect(sin(value)).toBe(sin(value))
      expect(cos(value)).toBe(cos(value))
      expect(exp(value)).toBe(exp(value))
      expect(atan2(value, 1 - value)).toBe(atan2(value, 1 - value))
    }
  })
})
