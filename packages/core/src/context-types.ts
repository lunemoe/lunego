import type {
  ComponentDef,
  CueDef,
  CuePayload,
  EventDef,
  EventPayload,
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

export interface TimeService {
  readonly tick: number
  readonly dt: number
  readonly elapsed: number
}

export interface BaseContext {
  readonly tick: number
  readonly time: TimeService
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
  model<S extends SchemaShape>(model: ModelDef<S>): DeepReadonly<SchemaValue<S>>
}

export interface InvariantContext {
  readonly tick: number
  read<S extends SchemaShape>(component: ComponentDef<S>): ComponentView<S>
  has(entity: Entity, target: ComponentDef | TagDef): boolean
  query(...args: QueryArg[]): Entity[]
  model<S extends SchemaShape>(model: ModelDef<S>): DeepReadonly<SchemaValue<S>>
}
