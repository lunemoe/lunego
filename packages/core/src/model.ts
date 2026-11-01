import { guardError } from './errors.js'
import { isRecord } from './guards.js'
import { cloneDeep } from './schema-coerce.js'

export interface ModelPatch {
  readonly model: string
  readonly path: readonly (string | number)[]
  readonly value: unknown
}

export function diffModel(
  model: string,
  before: unknown,
  after: unknown,
  path: readonly (string | number)[] = [],
  patches: ModelPatch[] = [],
): ModelPatch[] {
  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length !== after.length) {
      patches.push({ model, path, value: cloneDeep(after) })
      return patches
    }
    for (let index = 0; index < after.length; index += 1) {
      diffModel(model, before[index], after[index], [...path, index], patches)
    }
    return patches
  }
  if (isRecord(before) && isRecord(after)) {
    for (const key of Object.keys(after)) {
      diffModel(model, before[key], after[key], [...path, key], patches)
    }
    for (const key of Object.keys(before)) {
      if (!(key in after)) {
        patches.push({ model, path: [...path, key], value: undefined })
      }
    }
    return patches
  }
  if (!Object.is(before, after)) {
    patches.push({ model, path, value: cloneDeep(after) })
  }
  return patches
}

const mutatingArrayMethods: Readonly<Record<string, true>> = {
  copyWithin: true,
  fill: true,
  pop: true,
  push: true,
  reverse: true,
  shift: true,
  sort: true,
  splice: true,
  unshift: true,
}

/**
 * Guarded deep view over a model draft. Objects are proxied lazily; direct
 * writes are checked against the owning context's lifetime. Read views throw
 * on every mutation, which keeps the single write path enforceable.
 */
export function createModelProxy(
  value: unknown,
  assertWritable: (() => void) | null,
): unknown {
  if (!isRecord(value) && !Array.isArray(value)) {
    return value
  }
  const target = value
  return new Proxy(target, {
    get(object, property, receiver) {
      const current = Reflect.get(object, property, receiver)
      if (typeof current === 'function') {
        const isArrayMethod = Array.isArray(object) && typeof property === 'string'
        if (isArrayMethod && mutatingArrayMethods[property] === true) {
          return (...args: unknown[]) => {
            if (assertWritable === null) {
              throw guardError('LG004', `read-only model used for ${property}()`)
            }
            assertWritable()
            return Reflect.apply(current, object, args)
          }
        }
        return current.bind(object)
      }
      if (isRecord(current) || Array.isArray(current)) {
        return createModelProxy(current, assertWritable)
      }
      return current
    },
    set(object, property, next) {
      if (assertWritable === null) {
        throw guardError('LG004', `read-only model used to write ${String(property)}`)
      }
      assertWritable()
      Reflect.set(object, property, next)
      return true
    },
    deleteProperty(object, property) {
      if (assertWritable === null) {
        throw guardError('LG004', `read-only model used to delete ${String(property)}`)
      }
      assertWritable()
      return Reflect.deleteProperty(object, property)
    },
  })
}
