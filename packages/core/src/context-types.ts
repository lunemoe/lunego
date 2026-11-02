import type {
  ComponentDef,
  CueDef,
  CuePayload,
  EventDef,
  EventPayload,
  FlowStateDef,
  ModelDef,
  QueryArg,
  QueryDef,
  TagDef,
} from './definitions.js'
import type { RngStream } from './rng.js'
import type {
  ComponentView,
  ContentId,
  ContentTypeDef,
  DeepReadonly,
  Entity,
  SchemaShape,
  SchemaValue,
} from './schema.js'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  readonly level: LogLevel
  readonly context: string
  readonly tick: number
  readonly message: string
  readonly data: unknown
}

export interface LogService {
  debug(message: string, data?: unknown): void
  info(message: string, data?: unknown): void
  warn(message: string, data?: unknown): void
  error(message: string, data?: unknown): void
}

export interface MathService {
  readonly PI: number
  readonly TAU: number
  sin(value: number): number
  cos(value: number): number
  tan(value: number): number
  atan(value: number): number
  atan2(y: number, x: number): number
  log(value: number): number
  log2(value: number): number
  log10(value: number): number
  exp(value: number): number
  pow(base: number, exponent: number): number
  sqrt(value: number): number
}

export interface TimeService {
  readonly tick: number
  readonly dt: number
  readonly elapsed: number
}

export interface BaseContext {
  readonly tick: number
  readonly time: TimeService
  readonly math: MathService
  readonly log: LogService
  state<V extends string>(def: FlowStateDef<V>): V
  read<S extends SchemaShape>(component: ComponentDef<S>): ComponentView<S>
  has(entity: Entity, target: ComponentDef | TagDef): boolean
  query(...args: QueryArg[]): Entity[]
  model<S extends SchemaShape>(model: ModelDef<S>): DeepReadonly<SchemaValue<S>>
  content<Name extends string, Value>(
    type: ContentTypeDef<Name, Value>,
    id: ContentId<Name>,
  ): Value
  call<Args, Result>(query: QueryDef<Args, Result>, args: Args): Result
}

export interface StructuralContext {
  spawn(components: Readonly<Record<string, unknown>>): Entity
  add<S extends SchemaShape>(
    entity: Entity,
    component: ComponentDef<S>,
    value: SchemaValue<S>,
  ): void
  add(entity: Entity, tag: TagDef): void
  remove(entity: Entity, target: ComponentDef | TagDef): void
  despawn(entity: Entity): void
}

export type QueryContext = BaseContext

export interface HandlerContext extends BaseContext, StructuralContext {
  setState<V extends string>(def: FlowStateDef<V>, next: V): void
  write<S extends SchemaShape>(component: ComponentDef<S>): ComponentView<S>
  mutModel<S extends SchemaShape>(model: ModelDef<S>): SchemaValue<S>
  emit<E extends EventDef>(event: E, payload: EventPayload<E>): void
  cue<Cue extends CueDef>(cue: Cue, payload: CuePayload<Cue>): void
  rng(name: string): RngStream
}

export interface SystemContext extends HandlerContext {
  events<E extends EventDef>(event: E): ReadonlyArray<EventPayload<E>>
  prev<E extends EventDef>(event: E): ReadonlyArray<EventPayload<E>>
}

export interface RunIfContext {
  readonly tick: number
  readonly math: MathService
  readonly log: LogService
  state<V extends string>(def: FlowStateDef<V>): V
  model<S extends SchemaShape>(model: ModelDef<S>): DeepReadonly<SchemaValue<S>>
}

export interface InvariantContext {
  readonly tick: number
  read<S extends SchemaShape>(component: ComponentDef<S>): ComponentView<S>
  has(entity: Entity, target: ComponentDef | TagDef): boolean
  query(...args: QueryArg[]): Entity[]
  model<S extends SchemaShape>(model: ModelDef<S>): DeepReadonly<SchemaValue<S>>
}
