import { LuneGoError } from './errors.js'
import { isRecord } from './guards.js'
import { coerceValue } from './schema-coerce.js'
import { StateHasher, writeValue } from './hash.js'
import {
  t,
  type AnyTypeDef,
  type ConcreteTypeDef,
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

export interface ContentPack<Name extends string = string, Value = unknown> {
  readonly type: ContentTypeDef<Name, Value>
  readonly values: Readonly<Record<string, Value>>
  readonly ids: Readonly<Record<string, ContentId<Name>>>
}

/** Declares one content type's values; typed IDs are exposed at runtime and by `lunego gen`. */
export function defineContent<
  const Name extends string,
  Value,
  const Values extends Record<string, Value>,
>(
  type: ContentTypeDef<Name, Value>,
  values: Values,
): ContentPack<Name, Value> {
  const ids: Record<string, ContentId<Name>> = {}
  for (const id of Object.keys(values)) {
    ids[id] = parseContentId(type, id)
  }
  return {
    type,
    values: values as Readonly<Record<string, Value>>,
    ids,
  }
}

/**
 * Content is static data compiled outside the world. M0 implements the
 * registry, validation and JSON round-trip; typed constant generation belongs
 * to `lunego gen`.
 */
export interface AssetPackMetadata {
  readonly pack: string
  readonly version: string
  readonly hash: string
}

export class ContentRegistry {
  private assetPackValue: AssetPackMetadata | null = null
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

  setAssetPack(metadata: AssetPackMetadata): void {
    if (metadata.pack.length === 0 || metadata.version.length === 0 || metadata.hash.length === 0) {
      throw new LuneGoError('content_invalid', 'asset pack metadata needs pack/version/hash')
    }
    this.assetPackValue = { ...metadata }
  }

  assetPack(): AssetPackMetadata | null {
    return this.assetPackValue
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
    const pack = this.assetPackValue
    if (pack === null) {
      hasher.u8(0)
    } else {
      hasher.u8(1)
      hasher.string(pack.pack)
      hasher.string(pack.version)
      hasher.string(pack.hash)
    }
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

  /** Registers a declared pack, then verifies all `t.ref` targets. */
  addPack<Name extends string, Value>(pack: ContentPack<Name, Value>): void {
    this.registerType(pack.type)
    for (const id of Object.keys(pack.values)) {
      this.add(pack.type, parseContentId(pack.type, id), pack.values[id])
    }
    this.validateReferences()
  }

  /** Throws when any `t.ref` points at a missing content id (LG009). */
  validateReferences(): void {
    for (const [typeName, bucket] of this.entries) {
      const type = this.types.get(typeName)
      if (type === undefined) {
        continue
      }
      for (const [id, value] of bucket) {
        validateValue(this, t.struct(type.schema), value, `${typeName}/${id}`)
      }
    }
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
        if (target.has(id)) {
          throw new LuneGoError('content_invalid', `duplicate content id ${typeName}/${id}`)
        }
        const coerced = coerceValue(t.struct(type.schema), bucket[id], `${typeName}/${id}`)
        target.set(id, coerced)
      }
    }
    this.validateReferences()
  }
}

function validateValue(
  registry: ContentRegistry,
  def: AnyTypeDef,
  value: unknown,
  path: string,
): void {
  if (value === undefined) {
    return
  }
  const concrete = def as ConcreteTypeDef
  switch (concrete.kind) {
    case 'ref':
      if (!registry.has(concrete.contentType, value as ContentId)) {
        throw new LuneGoError(
          'content_missing',
          `${path} references missing ${concrete.contentType.name}/${String(value)}`,
          { rule: 'LG009' },
        )
      }
      return
    case 'array':
      if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) {
          validateValue(registry, concrete.element, value[index], `${path}[${index}]`)
        }
      }
      return
    case 'struct':
      if (isRecord(value)) {
        for (const field of Object.keys(concrete.shape)) {
          validateValue(registry, concrete.shape[field], value[field], `${path}.${field}`)
        }
      }
      return
    case 'optional':
      validateValue(registry, concrete.inner, value, path)
      return
    default:
      return
  }
}
