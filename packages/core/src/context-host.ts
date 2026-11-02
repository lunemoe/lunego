import type {
  ComponentDef,
  CueDef,
  FlowStateDef,
  CuePayload,
  EventDef,
  EventPayload,
  ModelDef,
  QueryArg,
  QueryDef,
  TagDef,
} from './definitions.js'
import type { ViewAccess } from './ecs/component-store.js'
import type { RngStream } from './rng.js'
import type { LogLevel } from './context-types.js'
import type {
  ComponentView,
  ContentId,
  ContentTypeDef,
  Entity,
  SchemaShape,
} from './schema.js'

/** The World surface that contexts are allowed to use. */
export interface ContextHost {
  readonly dev: boolean
  readonly dt: number
  readonly tick: number
  readFlowState(def: FlowStateDef): string
  requestStateChange(def: FlowStateDef, next: string): void
  log(level: LogLevel, context: string, message: string, data: unknown): void
  componentView<S extends SchemaShape>(
    component: ComponentDef<S>,
    access: ViewAccess | null,
  ): ComponentView<S>
  hasComponent(entity: Entity, target: ComponentDef | TagDef): boolean
  queryEntities(args: readonly QueryArg[]): Entity[]
  readModelValue(model: ModelDef): unknown
  draftModelValue(model: ModelDef): unknown
  contentValue<Name extends string, Value>(
    type: ContentTypeDef<Name, Value>,
    id: ContentId<Name>,
  ): Value
  runQuery<Args, Result>(query: QueryDef<Args, Result>, args: Args): Result
  spawnFromContext(
    components: Readonly<Record<string, unknown>>,
    assertWrite: (name: string) => void,
  ): Entity
  addFromContext(entity: Entity, target: ComponentDef | TagDef, value: unknown): void
  removeFromContext(entity: Entity, target: ComponentDef | TagDef): void
  despawnFromContext(entity: Entity, assertWrite: (name: string) => void): void
  emitEvent<E extends EventDef>(event: E, payload: EventPayload<E>): void
  currentEvents<E extends EventDef>(event: E): ReadonlyArray<EventPayload<E>>
  previousEvents<E extends EventDef>(event: E): ReadonlyArray<EventPayload<E>>
  emitCue<C extends CueDef>(cue: C, payload: CuePayload<C>, source: string): void
  rngStream(name: string): RngStream
}
