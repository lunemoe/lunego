import { LuneGoError } from './errors.js'
import { isRecord } from './guards.js'
import { coerceValue } from './schema-coerce.js'
import { StateHasher, writeValue } from './hash.js'
import {
  t,
  type ContentId,
  type ContentTypeDef,
  type SchemaShape,
  type SchemaValue,
} from './schema.js'

export function defineContentType<const Name extends string, const S extends SchemaShape>(
  name: Name,
  schema: S,
): ContentTypeDef<Name, SchemaValue<S>> {
  if (name.length === 0 || name.trim() !== name) {
    throw new LuneGoError('definition_invalid', 'content type name must not be empty')
  }
  return { kind: 'content', name, schema: { ...schema } }
}

export function parseContentId<Name extends string>(
  type: ContentTypeDef<Name>,
  id: string,
): ContentId<Name> {
  if (id.length === 0 || id.trim() !== id) {
    throw new LuneGoError('content_invalid', `${type.name} id must be a non-empty string`)
  }
  return id as ContentId<Name>
}

/**
 * Content is static data compiled outside the world. M0 implements the
 * registry, validation and JSON round-trip; typed constant generation belongs
 * to `lunego gen`.
 */
export class ContentRegistry {
  private readonly types = new Map<string, ContentTypeDef<string, unknown>>()
  private readonly entries = new Map<string, Map<string, unknown>>()

  registerType<Name extends string, Value>(type: ContentTypeDef<Name, Value>): void {
    const existing = this.types.get(type.name)
    if (existing === type) {
      return
    }
    if (existing !== undefined) {
      throw new LuneGoError(
        'content_invalid',
        `content type ${type.name} is already registered`,
      )
    }
    this.types.set(type.name, type)
    this.entries.set(type.name, new Map<string, unknown>())
  }

  add<Name extends string, Value>(
    type: ContentTypeDef<Name, Value>,
    id: ContentId<Name>,
    value: Value,
  ): void {
    const registered = this.types.get(type.name)
    if (registered !== type && registered !== undefined) {
      throw new LuneGoError(
        'content_invalid',
        `content type ${type.name} is registered with a different schema`,
      )
    }
    if (registered === undefined) {
      this.registerType(type)
    }
    const bucket = this.entries.get(type.name)
    if (bucket === undefined) {
      throw new LuneGoError('content_invalid', `content type ${type.name} has no bucket`)
    }
    if (bucket.has(id)) {
      throw new LuneGoError('content_invalid', `duplicate content id ${type.name}/${id}`)
    }
    const coerced = coerceValue(t.struct(type.schema), value, `${type.name}/${id}`)
    bucket.set(id, coerced)
  }

  has<Name extends string>(type: ContentTypeDef<Name>, id: ContentId<Name>): boolean {
    return this.entries.get(type.name)?.has(id) ?? false
  }

  get<Name extends string, Value>(
    type: ContentTypeDef<Name, Value>,
    id: ContentId<Name>,
  ): Value {
    const value = this.entries.get(type.name)?.get(id)
    if (value === undefined) {
      throw new LuneGoError('content_missing', `missing content ${type.name}/${id}`)
    }
    return value as Value
  }

  /** Deterministic identity of the content pack, recorded in snapshots. */
  fingerprint(): string {
    const hasher = new StateHasher()
    hasher.string('lunego-content')
    const typeNames = [...this.types.keys()].sort()
    hasher.u32(typeNames.length)
    for (const typeName of typeNames) {
      const type = this.types.get(typeName)
      const bucket = this.entries.get(typeName)
      if (type === undefined || bucket === undefined) {
        continue
      }
      hasher.string(typeName)
      const ids = [...bucket.keys()].sort()
      hasher.u32(ids.length)
      for (const id of ids) {
        hasher.string(id)
        writeValue(hasher, t.struct(type.schema), bucket.get(id))
      }
    }
    return hasher.hex()
  }

  ids<Name extends string>(type: ContentTypeDef<Name>): readonly string[] {
    return [...(this.entries.get(type.name)?.keys() ?? [])]
  }

  toJSON(): Readonly<Record<string, Readonly<Record<string, unknown>>>> {
    const result: Record<string, Record<string, unknown>> = {}
    for (const [typeName, bucket] of this.entries) {
      const values: Record<string, unknown> = {}
      for (const [id, value] of bucket) {
        values[id] = value
      }
      result[typeName] = values
    }
    return result
  }

  load(json: unknown): void {
    if (!isRecord(json)) {
      throw new LuneGoError('content_invalid', 'content pack must be an object')
    }
    for (const typeName of Object.keys(json)) {
      const type = this.types.get(typeName)
      if (type === undefined) {
        throw new LuneGoError('content_invalid', `unknown content type ${typeName}`)
      }
      const bucket = json[typeName]
      if (!isRecord(bucket)) {
        throw new LuneGoError('content_invalid', `content type ${typeName} must be an object`)
      }
      const target = this.entries.get(typeName)
      if (target === undefined) {
        throw new LuneGoError('content_invalid', `content type ${typeName} has no bucket`)
      }
      for (const id of Object.keys(bucket)) {
        const coerced = coerceValue(t.struct(type.schema), bucket[id], `${typeName}/${id}`)
        target.set(id, coerced)
      }
    }
  }
}
