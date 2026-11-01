/**
 * Schema DSL: one declaration produces the TypeScript type, column layout,
 * validation, serialization and (later) migration metadata.
 *
 * The runtime only implements the capabilities M0 needs. Every declared kind
 * is fully validated and serialized; there are no stub kinds.
 */

/** Packed 32-bit entity id. 0 is never handed out. */
export type Entity = number

/** `world` and `profile` are separated at save time (architecture 9). */
export type PersistScope = 'world' | 'profile'

export interface Vec2 {
  readonly x: number
  readonly y: number
}

export type ScalarKind = 'f32' | 'i32' | 'u8' | 'u16' | 'u32' | 'bool' | 'entity'
export type NumericScalarKind = Exclude<ScalarKind, 'bool'>
export type TypeKind =
  | ScalarKind
  | 'vec2'
  | 'str'
  | 'enum'
  | 'ref'
  | 'asset'
  | 'text'
  | 'array'
  | 'struct'
  | 'optional'

/**
 * Erased schema field type stored on definitions. Concrete t.* values are
 * assignable to it; inference uses the concrete types below.
 */
export interface AnyTypeDef {
  readonly kind: TypeKind
  readonly _type?: unknown
}

/** Branded content id. Values are produced by `parseContentId` or generated ids. */
export type ContentId<Name extends string = string> = string & {
  readonly __contentType: Name
}

export interface ContentTypeDef<Name extends string = string, Value = unknown> {
  readonly kind: 'content'
  readonly name: Name
  readonly schema: SchemaShape
  readonly _value?: Value
}

export interface ScalarType<T = number, K extends ScalarKind = ScalarKind> {
  readonly kind: K
  readonly _type?: T
}

export interface Vec2Type {
  readonly kind: 'vec2'
  readonly _type?: Vec2
}

export interface StrType {
  readonly kind: 'str'
  readonly _type?: string
}

export interface EnumType<V extends string = string> {
  readonly kind: 'enum'
  readonly values: readonly V[]
  readonly _type?: V
}

export interface RefType<Name extends string = string> {
  readonly kind: 'ref'
  readonly contentType: ContentTypeDef<Name>
  readonly _type?: ContentId<Name>
}

export interface AssetType {
  readonly kind: 'asset'
  readonly assetKind: string
  readonly _type?: string
}

export interface TextType {
  readonly kind: 'text'
  readonly _type?: string
}

export interface ArrayType<E extends AnyTypeDef = AnyTypeDef> {
  readonly kind: 'array'
  readonly element: E
}

export interface StructType<S extends SchemaShape = SchemaShape> {
  readonly kind: 'struct'
  readonly shape: S
}

export interface OptionalType<I extends AnyTypeDef = AnyTypeDef> {
  readonly kind: 'optional'
  readonly inner: I
}

export type ConcreteTypeDef =
  | ScalarType<number, NumericScalarKind>
  | ScalarType<boolean, 'bool'>
  | Vec2Type
  | StrType
  | EnumType<string>
  | RefType<string>
  | AssetType
  | TextType
  | ArrayType<AnyTypeDef>
  | StructType<SchemaShape>
  | OptionalType<AnyTypeDef>

export type SchemaShape = Readonly<Record<string, AnyTypeDef>>

export type SchemaValue<S extends SchemaShape> = {
  [K in keyof S]: Infer<S[K]>
}

export type Infer<T extends AnyTypeDef> = T extends ScalarType<infer V, infer _K>
  ? V
  : T extends Vec2Type
    ? Vec2
    : T extends StrType
      ? string
      : T extends EnumType<infer V>
        ? V
        : T extends RefType<infer Name>
          ? ContentId<Name>
          : T extends AssetType
            ? string
            : T extends TextType
              ? string
              : T extends ArrayType<infer E>
                ? Array<Infer<E>>
                : T extends StructType<infer S>
                  ? SchemaValue<S>
                  : T extends OptionalType<infer I>
                    ? Infer<I> | undefined
                    : never

/** Column type stored for a field. Numeric fields use TypedArrays. */
export type ColumnOf<T extends AnyTypeDef> = T extends ScalarType<infer _V, infer K>
  ? K extends 'f32'
    ? Float32Array
    : K extends 'i32'
      ? Int32Array
      : K extends 'u8'
        ? Uint8Array
        : K extends 'u16'
          ? Uint16Array
          : K extends 'u32' | 'entity'
            ? Uint32Array
            : K extends 'bool'
              ? Array<boolean | undefined>
              : never
  : Array<Infer<T> | undefined>

export type ComponentView<S extends SchemaShape> = {
  [K in keyof S]: ColumnOf<S[K]>
}

export type DeepReadonly<T> = T extends (infer U)[]
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T

export function isNumericKind(kind: TypeKind): boolean {
  switch (kind) {
    case 'f32':
    case 'i32':
    case 'u8':
    case 'u16':
    case 'u32':
    case 'entity':
      return true
    default:
      return false
  }
}

function freezeEnumValues<const V extends readonly string[]>(values: V): V {
  if (values.length === 0) {
    throw new Error('t.enum requires at least one value')
  }
  const seen = new Set<string>()
  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error('t.enum values must be non-empty strings')
    }
    if (seen.has(value)) {
      throw new Error(`t.enum duplicate value: ${value}`)
    }
    seen.add(value)
  }
  return values
}

const f32: ScalarType<number, 'f32'> = { kind: 'f32' }
const i32: ScalarType<number, 'i32'> = { kind: 'i32' }
const u8: ScalarType<number, 'u8'> = { kind: 'u8' }
const u16: ScalarType<number, 'u16'> = { kind: 'u16' }
const u32: ScalarType<number, 'u32'> = { kind: 'u32' }
const bool: ScalarType<boolean, 'bool'> = { kind: 'bool' }
const entity: ScalarType<Entity, 'entity'> = { kind: 'entity' }
const vec2: Vec2Type = { kind: 'vec2' }
const str: StrType = { kind: 'str' }
const text: TextType = { kind: 'text' }

function enumType<const V extends readonly string[]>(values: V): EnumType<V[number]> {
  return { kind: 'enum', values: freezeEnumValues(values) }
}

function refType<Name extends string, Value>(
  contentType: ContentTypeDef<Name, Value>,
): RefType<Name> {
  if (contentType.kind !== 'content') {
    throw new Error('t.ref requires a content type')
  }
  return { kind: 'ref', contentType }
}

function assetType(assetKind: string): AssetType {
  if (assetKind.length === 0) {
    throw new Error('t.asset requires a non-empty asset kind')
  }
  return { kind: 'asset', assetKind }
}

function arrayType<E extends AnyTypeDef>(element: E): ArrayType<E> {
  if (element === undefined) {
    throw new Error('t.array requires an element type')
  }
  return { kind: 'array', element }
}

function structType<const S extends SchemaShape>(shape: S): StructType<S> {
  return { kind: 'struct', shape: { ...shape } }
}

function optionalType<I extends AnyTypeDef>(inner: I): OptionalType<I> {
  if (inner === undefined) {
    throw new Error('t.optional requires an inner type')
  }
  return { kind: 'optional', inner }
}

export const t = {
  f32,
  i32,
  u8,
  u16,
  u32,
  bool,
  vec2,
  str,
  text,
  entity,
  enum: enumType,
  ref: refType,
  asset: assetType,
  array: arrayType,
  struct: structType,
  optional: optionalType,
} as const
