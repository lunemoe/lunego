import { describe, expect, it } from 'vitest'
import {
  ContentRegistry,
  coerceValue,
  defineContentType,
  parseContentId,
  t,
} from '../index.js'

describe('content registry', () => {
  it('registers typed content, validates it and round-trips JSON', () => {
    const Monster = defineContentType('monster', {
      hp: t.i32,
      tags: t.array(t.str),
    })
    const registry = new ContentRegistry()
    registry.registerType(Monster)
    const slime = parseContentId(Monster, 'slime')
    registry.add(Monster, slime, { hp: 10, tags: ['ooze'] })

    expect(registry.has(Monster, slime)).toBe(true)
    expect(registry.get(Monster, slime)).toEqual({ hp: 10, tags: ['ooze'] })
    expect(registry.ids(Monster)).toEqual(['slime'])

    const json = registry.toJSON()
    const restored = new ContentRegistry()
    restored.registerType(Monster)
    restored.load(JSON.parse(JSON.stringify(json)))
    expect(restored.get(Monster, slime)).toEqual({ hp: 10, tags: ['ooze'] })
  })

  it('includes asset pack metadata in the fingerprint', () => {
    const a = new ContentRegistry()
    const b = new ContentRegistry()
    a.setAssetPack({ pack: 'demo', version: '1', hash: 'aaa' })
    b.setAssetPack({ pack: 'demo', version: '2', hash: 'aaa' })
    expect(a.fingerprint()).not.toBe(b.fingerprint())
    expect(a.assetPack()).toEqual({ pack: 'demo', version: '1', hash: 'aaa' })
    expect(a.fingerprint()).not.toBe(new ContentRegistry().fingerprint())
  })

  it('rejects duplicate ids, unknown types and invalid values', () => {
    const Monster = defineContentType('monster', { hp: t.i32 })
    const registry = new ContentRegistry()
    registry.registerType(Monster)
    const slime = parseContentId(Monster, 'slime')
    registry.add(Monster, slime, { hp: 10 })
    expect(() => registry.add(Monster, slime, { hp: 11 })).toThrow(/duplicate content id/)
    expect(() => registry.add(Monster, parseContentId(Monster, 'bat'), { hp: 'bad' })).toThrow(
      /finite number/,
    )
    expect(() => registry.load({ unknown: {} })).toThrow(/unknown content type/)
  })

  it('supports references in schemas', () => {
    const Monster = defineContentType('monster', { hp: t.i32 })
    const Drop = t.struct({ monster: t.ref(Monster), weight: t.f32 })
    const value = coerceValue(Drop, {
      monster: parseContentId(Monster, 'slime'),
      weight: 0.5,
    })
    expect(value.monster).toBe('slime')
    expect(() => coerceValue(Drop, { monster: '', weight: 0.5 })).toThrow(
      /non-empty content id/,
    )
  })
})
