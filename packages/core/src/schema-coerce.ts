import { schemaError } from './errors.js'
import { isRecord } from './guards.js'
import type {
  AnyTypeDef,
  ConcreteTypeDef,
  Infer,
} from './schema.js'

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    schemaError(path, 'string')
  }
  return value
}

function requireFinite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    schemaError(path, 'finite number')
  }
  return value
}

function coerceUnknown(type: ConcreteTypeDef, value: unknown, path: string): unknown {
  switch (type.kind) {
    case 'f32':
      return Math.fround(requireFinite(value, path))
    case 'i32': {
      const number = requireFinite(value, path)
      if (!Number.isInteger(number) || number < -2147483648 || number > 2147483647) {
        schemaError(path, 'i32')
      }
      return number
    }
    case 'u8': {
      const number = requireFinite(value, path)
      if (!Number.isInteger(number) || number < 0 || number > 255) {
        schemaError(path, 'u8')
      }
      return number
    }
    case 'u16': {
      const number = requireFinite(value, path)
      if (!Number.isInteger(number) || number < 0 || number > 65535) {
        schemaError(path, 'u16')
      }
      return number
    }
    case 'u32': {
      const number = requireFinite(value, path)
      if (!Number.isInteger(number) || number < 0 || number > 4294967295) {
        schemaError(path, 'u32')
      }
      return number
    }
    case 'entity': {
      const number = requireFinite(value, path)
      if (!Number.isInteger(number) || number < 0 || number > 4294967295) {
        schemaError(path, 'entity id')
      }
      return number
    }
    case 'bool':
      if (typeof value !== 'boolean') {
        schemaError(path, 'boolean')
      }
      return value
    case 'vec2': {
      if (!isRecord(value)) {
        schemaError(path, 'vec2')
      }
      const keys = Object.keys(value)
      if (keys.length !== 2 || !keys.includes('x') || !keys.includes('y')) {
        schemaError(path, 'vec2 {x, y}')
      }
      return {
        x: Math.fround(requireFinite(value['x'], `${path}.x`)),
        y: Math.fround(requireFinite(value['y'], `${path}.y`)),
      }
    }
    case 'str':
      return requireString(value, path)
    case 'text':
      return requireString(value, path)
    case 'asset': {
      const id = requireString(value, path)
      if (id.length === 0) {
        schemaError(path, 'non-empty asset id')
      }
      return id
    }
    case 'enum':
      if (typeof value !== 'string' || !type.values.includes(value)) {
        schemaError(path, `one of ${type.values.join(', ')}`)
      }
      return value
    case 'ref': {
      const id = requireString(value, path)
      if (id.length === 0) {
        schemaError(path, 'non-empty content id')
      }
      return id
    }
    case 'array': {
      if (!Array.isArray(value)) {
        schemaError(path, 'array')
      }
      return value.map((item, index) =>
        coerceUnknown(type.element as ConcreteTypeDef, item, `${path}[${index}]`),
      )
    }
    case 'struct': {
      if (!isRecord(value)) {
        schemaError(path, 'object')
      }
      const result: Record<string, unknown> = {}
      for (const key of Object.keys(value)) {
        if (type.shape[key] === undefined) {
          schemaError(`${path}.${key}`, 'declared struct field')
        }
      }
      for (const key of Object.keys(type.shape)) {
        const fieldType = type.shape[key]
        const fieldValue = value[key]
        if (fieldValue === undefined && fieldType.kind !== 'optional') {
          schemaError(`${path}.${key}`, 'required field')
        }
        result[key] = coerceUnknown(
          fieldType as ConcreteTypeDef,
          fieldValue,
          `${path}.${key}`,
        )
      }
      return result
    }
    case 'optional':
      return value === undefined
        ? undefined
        : coerceUnknown(type.inner as ConcreteTypeDef, value, path)
  }
}

/**
 * Validate and normalize a value. Clones arrays/objects so callers cannot
 * alias live state. Floats are rounded to their declared storage precision.
 */
export function coerceValue<T extends AnyTypeDef>(
  type: T,
  value: unknown,
  path = 'value',
): Infer<T> {
  return coerceUnknown(type as ConcreteTypeDef, value, path) as Infer<T>
}

/** Deep clone for schema-shaped plain data (objects, arrays, primitives). */
export function cloneDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => cloneDeep(item)) as T
  }
  if (isRecord(value)) {
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(value)) {
      result[key] = cloneDeep(value[key])
    }
    return result as T
  }
  return value
}
