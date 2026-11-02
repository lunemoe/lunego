import { guardError } from '../errors.js'
import { createModelProxy } from '../model.js'
import { isNumericKind, type AnyTypeDef, type ComponentView, type SchemaShape } from '../schema.js'
import { coerceValue } from '../schema-coerce.js'
import type { Entity } from '../schema.js'

export type NumericArray =
  | Float32Array
  | Int32Array
  | Uint8Array
  | Uint16Array
  | Uint32Array

const INITIAL_COLUMN_CAPACITY = 64

export interface Column {
  readonly length: number
  ensure(index: number): void
  get(index: number): unknown
  set(index: number, value: unknown): void
  clear(index: number): void
}

class NumericColumn implements Column {
  private data: NumericArray
  private readonly create: (length: number) => NumericArray

  constructor(create: (length: number) => NumericArray) {
    this.create = create
    this.data = create(INITIAL_COLUMN_CAPACITY)
  }

  get length(): number {
    return this.data.length
  }

  ensure(index: number): void {
    if (index < this.data.length) {
      return
    }
    let size = this.data.length
    while (size <= index) {
      size *= 2
    }
    const next = this.create(size)
    next.set(this.data)
    this.data = next
  }

  get(index: number): unknown {
    return this.data[index]
  }

  set(index: number, value: unknown): void {
    this.ensure(index)
    this.data[index] = Number(value)
  }

  clear(index: number): void {
    if (index < this.data.length) {
      this.data[index] = 0
    }
  }

  raw(): NumericArray {
    return this.data
  }
}

class PlainColumn implements Column {
  private data: Array<unknown> = new Array<unknown>(INITIAL_COLUMN_CAPACITY)

  get length(): number {
    return this.data.length
  }

  ensure(index: number): void {
    if (index < this.data.length) {
      return
    }
    let size = this.data.length
    while (size <= index) {
      size *= 2
    }
    this.data.length = size
  }

  get(index: number): unknown {
    return this.data[index]
  }

  set(index: number, value: unknown): void {
    this.ensure(index)
    this.data[index] = value
  }

  clear(index: number): void {
    if (index < this.data.length) {
      this.data[index] = undefined
    }
  }

  raw(): Array<unknown> {
    return this.data
  }
}

export function createColumn(type: AnyTypeDef): Column {
  if (!isNumericKind(type.kind)) {
    return new PlainColumn()
  }
  switch (type.kind) {
    case 'f32':
      return new NumericColumn((length) => new Float32Array(length))
    case 'i32':
      return new NumericColumn((length) => new Int32Array(length))
    case 'u8':
      return new NumericColumn((length) => new Uint8Array(length))
    case 'u16':
      return new NumericColumn((length) => new Uint16Array(length))
    case 'u32':
    case 'entity':
      return new NumericColumn((length) => new Uint32Array(length))
    default:
      return new PlainColumn()
  }
}

export interface ViewAccess {
  assertWritable(): void
}

export interface EntityIndexResolver {
  resolve(entity: Entity): number | undefined
}

function indexKey(prop: string | symbol): number | null {
  if (typeof prop !== 'string') {
    return null
  }
  for (let i = 0; i < prop.length; i += 1) {
    const code = prop.charCodeAt(i)
    if (code < 48 || code > 57) {
      return null
    }
  }
  return prop.length === 0 ? null : Number(prop)
}

function numericView(
  column: Column,
  type: AnyTypeDef,
  fieldName: string,
  access: ViewAccess | null,
  entities: EntityIndexResolver,
  validate: boolean,
): NumericArray {
  const target = new Float32Array(0)
  const proxy = new Proxy(target, {
    get(_target, prop) {
      const entity = indexKey(prop)
      if (entity !== null) {
        const index = entities.resolve(entity)
        return index === undefined ? undefined : column.get(index)
      }
      if (prop === 'length') {
        return column.length
      }
      if (column instanceof NumericColumn) {
        const raw = column.raw()
        const value = Reflect.get(raw, prop)
        return typeof value === 'function' ? value.bind(raw) : value
      }
      return undefined
    },
    set(_target, prop, value) {
      const entity = indexKey(prop)
      if (entity === null) {
        return false
      }
      if (access === null) {
        throw guardError('LG004', 'read-only component view used for a write')
      }
      access.assertWritable()
      const index = entities.resolve(entity)
      if (index === undefined) {
        throw guardError('LG004', `entity ${entity} is not alive`)
      }
      column.set(index, validate ? coerceValue(type, value, fieldName) : value)
      return true
    },
  })
  return proxy
}

function plainView(
  column: Column,
  type: AnyTypeDef,
  fieldName: string,
  access: ViewAccess | null,
  entities: EntityIndexResolver,
  validate: boolean,
): Array<unknown> {
  const target: Array<unknown> = []
  const proxy = new Proxy(target, {
    get(_target, prop) {
      const entity = indexKey(prop)
      if (entity !== null) {
        const index = entities.resolve(entity)
        if (index === undefined) {
          return undefined
        }
        const value = column.get(index)
        if (value === null || typeof value !== 'object') {
          return value
        }
        return createModelProxy(
          value,
          access === null ? null : () => access.assertWritable(),
        )
      }
      if (prop === 'length') {
        return column.length
      }
      if (column instanceof PlainColumn) {
        const raw = column.raw()
        const value = Reflect.get(raw, prop)
        return typeof value === 'function' ? value.bind(raw) : value
      }
      return undefined
    },
    set(_target, prop, value) {
      const entity = indexKey(prop)
      if (entity === null) {
        return false
      }
      if (access === null) {
        throw guardError('LG004', 'read-only component view used for a write')
      }
      access.assertWritable()
      const index = entities.resolve(entity)
      if (index === undefined) {
        throw guardError('LG004', `entity ${entity} is not alive`)
      }
      column.set(index, validate ? coerceValue(type, value, fieldName) : value)
      return true
    },
  })
  return proxy
}

export interface StoredComponentDefinition {
  readonly name: string
  readonly schema: SchemaShape
}

export class ComponentStore<S extends SchemaShape = SchemaShape> {
  readonly def: StoredComponentDefinition
  readonly columns = new Map<string, Column>()
  readonly hashFields: readonly { readonly name: string; readonly type: AnyTypeDef }[]
  readonly added = new Set<Entity>()
  readonly removed = new Set<Entity>()
  private present = new Uint8Array(INITIAL_COLUMN_CAPACITY)

  constructor(def: StoredComponentDefinition & { readonly schema: S }) {
    this.def = def
    for (const field of Object.keys(def.schema)) {
      this.columns.set(field, createColumn(def.schema[field]))
    }
    this.hashFields = Object.keys(def.schema).map((name) => ({ name, type: def.schema[name] }))
  }

  has(index: number): boolean {
    return index > 0 && index < this.present.length && this.present[index] === 1
  }

  ensure(index: number): void {
    if (index >= this.present.length) {
      let size = this.present.length
      while (size <= index) {
        size *= 2
      }
      const next = new Uint8Array(size)
      next.set(this.present)
      this.present = next
    }
    for (const column of this.columns.values()) {
      column.ensure(index)
    }
  }

  add(index: number, value: Readonly<Record<string, unknown>>): void {
    this.ensure(index)
    this.present[index] = 1
    for (const [field, column] of this.columns) {
      column.set(index, value[field])
    }
  }

  remove(index: number): void {
    if (!this.has(index)) {
      return
    }
    this.present[index] = 0
    for (const column of this.columns.values()) {
      column.clear(index)
    }
  }

  read(index: number): Record<string, unknown> | undefined {
    if (!this.has(index)) {
      return undefined
    }
    const result: Record<string, unknown> = {}
    for (const [field, column] of this.columns) {
      result[field] = column.get(index)
    }
    return result
  }

  readField(field: string, index: number): unknown {
    const column = this.columns.get(field)
    if (column === undefined) {
      throw new Error(`unknown field ${field} on ${this.def.name}`)
    }
    return column.get(index)
  }

  column(field: string): Column {
    const column = this.columns.get(field)
    if (column === undefined) {
      throw new Error(`unknown field ${field} on ${this.def.name}`)
    }
    return column
  }

  clearChanges(): void {
    this.added.clear()
    this.removed.clear()
  }

  setChanges(added: Iterable<Entity>, removed: Iterable<Entity>): void {
    this.clearChanges()
    for (const entity of added) {
      this.added.add(entity)
    }
    for (const entity of removed) {
      this.removed.add(entity)
    }
  }
}

export function buildComponentView<S extends SchemaShape>(
  store: ComponentStore<S>,
  access: ViewAccess | null,
  entities: EntityIndexResolver,
  validate: boolean,
): ComponentView<S> {
  const view: Record<string, unknown> = {}
  for (const [field, column] of store.columns) {
    const type = store.def.schema[field]
    const fieldName = `${store.def.name}.${field}`
    view[field] =
      column instanceof NumericColumn
        ? numericView(column, type, fieldName, access, entities, validate)
        : plainView(column, type, fieldName, access, entities, validate)
  }
  return view as ComponentView<S>
}
