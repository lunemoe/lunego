import type { AnyTypeDef, ConcreteTypeDef } from './schema.js'

const FNV_OFFSET = 0xcbf29ce484222325n
const FNV_PRIME = 0x100000001b3n
const MASK_64 = 0xffffffffffffffffn

function utf8Bytes(value: string): number[] {
  const bytes: number[] = []
  for (let index = 0; index < value.length; index += 1) {
    let codePoint = value.charCodeAt(index)
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && index + 1 < value.length) {
      const low = value.charCodeAt(index + 1)
      if (low >= 0xdc00 && low <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (low - 0xdc00)
        index += 1
      }
    }
    if (codePoint < 0x80) {
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f))
    } else if (codePoint < 0x10000) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      )
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      )
    }
  }
  return bytes
}

/**
 * Deterministic 64-bit FNV-1a over a canonical byte stream. Structure is
 * encoded field-by-field from schemas, never via JSON stringification.
 */
export class StateHasher {
  private hash = FNV_OFFSET
  private readonly floatBuffer = new ArrayBuffer(4)
  private readonly floatView = new DataView(this.floatBuffer)

  byte(value: number): void {
    this.hash ^= BigInt(value & 0xff)
    this.hash = (this.hash * FNV_PRIME) & MASK_64
  }

  bytes(values: readonly number[]): void {
    for (const value of values) {
      this.byte(value)
    }
  }

  u8(value: number): void {
    this.byte(value)
  }

  u16(value: number): void {
    this.byte(value)
    this.byte(value >>> 8)
  }

  u32(value: number): void {
    this.byte(value)
    this.byte(value >>> 8)
    this.byte(value >>> 16)
    this.byte(value >>> 24)
  }

  i32(value: number): void {
    this.u32(value >>> 0)
  }

  f32(value: number): void {
    this.floatView.setFloat32(0, value, true)
    this.byte(this.floatView.getUint8(0))
    this.byte(this.floatView.getUint8(1))
    this.byte(this.floatView.getUint8(2))
    this.byte(this.floatView.getUint8(3))
  }

  string(value: string): void {
    const bytes = utf8Bytes(value)
    this.u32(bytes.length)
    this.bytes(bytes)
  }

  safeInteger(value: number): void {
    this.u32(value >>> 0)
    this.u32(Math.floor(value / 4294967296))
  }

  hex(): string {
    return this.hash.toString(16).padStart(16, '0')
  }
}

export function writeValue(hasher: StateHasher, type: AnyTypeDef, value: unknown): void {
  const concrete = type as ConcreteTypeDef
  switch (concrete.kind) {
    case 'f32':
      hasher.f32(value as number)
      return
    case 'i32':
      hasher.i32(value as number)
      return
    case 'u8':
      hasher.u8(value as number)
      return
    case 'u16':
      hasher.u16(value as number)
      return
    case 'u32':
    case 'entity':
      hasher.u32(value as number)
      return
    case 'bool':
      hasher.u8(value === true ? 1 : 0)
      return
    case 'vec2': {
      const vector = value as { x: number; y: number }
      hasher.f32(vector.x)
      hasher.f32(vector.y)
      return
    }
    case 'str':
    case 'text':
    case 'asset':
    case 'enum':
    case 'ref':
      hasher.string(value as string)
      return
    case 'array': {
      const items = value as unknown[]
      hasher.u32(items.length)
      for (const item of items) {
        writeValue(hasher, concrete.element, item)
      }
      return
    }
    case 'struct': {
      const record = value as Record<string, unknown>
      for (const key of Object.keys(concrete.shape)) {
        writeValue(hasher, concrete.shape[key], record[key])
      }
      return
    }
    case 'optional':
      if (value === undefined) {
        hasher.u8(0)
      } else {
        hasher.u8(1)
        writeValue(hasher, concrete.inner, value)
      }
      return
  }
}

export function hashValues(entries: ReadonlyArray<readonly [AnyTypeDef, unknown]>): string {
  const hasher = new StateHasher()
  for (const [type, value] of entries) {
    writeValue(hasher, type, value)
  }
  return hasher.hex()
}
