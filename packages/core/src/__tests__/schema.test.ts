import { describe, expect, it } from 'vitest'
import {
  coerceValue,
  defineComponent,
  defineContentType,
  defineTag,
  parseContentId,
  t,
  type ContentId,
} from '../index.js'

describe('schema DSL', () => {
  it('rounds f32 storage and rejects non-finite values', () => {
    expect(coerceValue(t.f32, 0.1)).toBe(Math.fround(0.1))
    expect(() => coerceValue(t.f32, Number.NaN)).toThrow(/finite number/)
    expect(() => coerceValue(t.f32, Number.POSITIVE_INFINITY)).toThrow(/finite number/)
  })

  it('validates integer ranges', () => {
    expect(coerceValue(t.i32, -2147483648)).toBe(-2147483648)
    expect(() => coerceValue(t.i32, 1.5)).toThrow(/i32/)
    expect(() => coerceValue(t.i32, 2147483648)).toThrow(/i32/)
    expect(() => coerceValue(t.u8, 256)).toThrow(/u8/)
    expect(() => coerceValue(t.u16, -1)).toThrow(/u16/)
    expect(() => coerceValue(t.u32, 4294967296)).toThrow(/u32/)
  })

  it('validates vectors, enums, arrays and structs', () => {
    expect(coerceValue(t.vec2, { x: 1, y: 2 })).toEqual({ x: 1, y: 2 })
    expect(() => coerceValue(t.vec2, { x: 1, y: 2, z: 3 })).toThrow(/vec2/)
    const element = t.enum(['slime', 'bat'] as const)
    expect(coerceValue(element, 'bat')).toBe('bat')
    expect(() => coerceValue(element, 'dragon')).toThrow(/slime, bat/)
    const shape = t.struct({ name: t.str, hp: t.i32, note: t.optional(t.str) })
    expect(coerceValue(shape, { name: 'x', hp: 3 })).toEqual({
      name: 'x',
      hp: 3,
      note: undefined,
    })
    expect(() => coerceValue(shape, { name: 'x', hp: 3, extra: true })).toThrow(
      /declared struct field/,
    )
    expect(() => coerceValue(shape, { name: 'x' })).toThrow(/required field/)
    expect(coerceValue(t.array(t.i32), [1, 2, 3])).toEqual([1, 2, 3])
    expect(() => coerceValue(t.array(t.i32), [1, 2.5])).toThrow(/i32/)
  })

  it('rejects invalid definitions', () => {
    expect(() => defineComponent('Empty', {})).toThrow(/defineTag/)
    expect(() => t.enum([])).toThrow(/at least one/)
    expect(() => t.enum(['a', 'a'])).toThrow(/duplicate/)
    expect(() => defineTag('')).toThrow(/must not be empty/)
    expect(() => t.asset('')).toThrow(/asset kind/)
  })

  it('keeps content ids branded at the type level', () => {
    const Monster = defineContentType('monster', { hp: t.i32 })
    const id = parseContentId(Monster, 'slime')
    const typed: ContentId<'monster'> = id
    expect(typed).toBe('slime')
    expect(() => parseContentId(Monster, '')).toThrow(/non-empty/)
  })
})
