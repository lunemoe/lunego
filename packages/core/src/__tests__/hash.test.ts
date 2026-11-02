import { describe, expect, it } from 'vitest'
import { StateHasher, writeValue } from '../hash.js'
import { t } from '../schema.js'

function referenceHex(stream: readonly number[]): string {
  let hash = 0xcbf29ce484222325n
  for (const value of stream) {
    hash ^= BigInt(value & 0xff)
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn
  }
  return hash.toString(16).padStart(16, '0')
}

describe('state hasher', () => {
  it('matches the 64-bit FNV reference byte stream', () => {
    const hasher = new StateHasher()
    const bytes: number[] = []
    const push = (value: number): void => {
      hasher.byte(value)
      bytes.push(value)
    }
    for (const value of [0, 1, 255, 17, 200, 42]) push(value)
    hasher.u16(0xabcd)
    bytes.push(0xcd, 0xab)
    hasher.u32(0xdeadbeef)
    bytes.push(0xef, 0xbe, 0xad, 0xde)
    hasher.f32(1.5)
    hasher.string('lunego')
    expect(hasher.hex()).toBe(referenceHex([...bytes, 0, 0, 0xc0, 0x3f, 6, 0, 0, 0, 108, 117, 110, 101, 103, 111]))
  })

  it('hashes scalar and structured values deterministically', () => {
    const first = new StateHasher()
    const second = new StateHasher()
    writeValue(first, t.struct({ x: t.f32, y: t.i32, tags: t.array(t.str) }), { x: 1.5, y: 2, tags: ['a', 'b'] })
    writeValue(second, t.struct({ x: t.f32, y: t.i32, tags: t.array(t.str) }), { x: 1.5, y: 2, tags: ['a', 'b'] })
    expect(first.hex()).toBe(second.hex())
  })
})
