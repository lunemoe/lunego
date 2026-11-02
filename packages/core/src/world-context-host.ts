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
import type { LogLevel } from './context-types.js'
import type { ViewAccess } from './ecs/component-store.js'
import type { RngStream } from './rng.js'
import type {
  ComponentView,
  ContentId,
  ContentTypeDef,
  Entity,
  SchemaShape,
} from './schema.js'
import type { WorldInternals } from './world-internals.js'
import type { WorldSnapshot } from './snapshot.js'

export interface WorldContextDeps {
  readonly dev: boolean
  readonly dt: number
  tick(): number
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
  spawn(components: Readonly<Record<string, unknown>>, assertWrite: (name: string) => void): Entity
  add(entity: Entity, target: ComponentDef | TagDef, value: unknown): void
  remove(entity: Entity, target: ComponentDef | TagDef): void
  despawn(entity: Entity, assertWrite: (name: string) => void): void
  emitEvent<E extends EventDef>(event: E, payload: EventPayload<E>): void
  currentEvents<E extends EventDef>(event: E): ReadonlyArray<EventPayload<E>>
  previousEvents<E extends EventDef>(event: E): ReadonlyArray<EventPayload<E>>
  emitCue<C extends CueDef>(cue: C, payload: CuePayload<C>, source: string): void
  rngStream(name: string): RngStream
  readFlowState(def: FlowStateDef): string
  requestStateChange(def: FlowStateDef, next: string): void
  queueEvent<E extends EventDef>(event: E, payload: EventPayload<E>): void
  restore(snapshot: WorldSnapshot): void
}

export function createWorldContextHost(deps: WorldContextDeps): WorldInternals {
  return {
    get dev() { return deps.dev },
    get dt() { return deps.dt },
    get tick() { return deps.tick() },
    log: (level, context, message, data) => deps.log(level, context, message, data),
    componentView: (component, access) => deps.componentView(component, access),
    hasComponent: (entity, target) => deps.hasComponent(entity, target),
    queryEntities: (args) => deps.queryEntities(args),
    readModelValue: (model) => deps.readModelValue(model),
    draftModelValue: (model) => deps.draftModelValue(model),
    contentValue: (type, id) => deps.contentValue(type, id),
    runQuery: (query, args) => deps.runQuery(query, args),
    spawnFromContext: (components, assertWrite) => deps.spawn(components, assertWrite),
    addFromContext: (entity, target, value) => deps.add(entity, target, value),
    removeFromContext: (entity, target) => deps.remove(entity, target),
    despawnFromContext: (entity, assertWrite) => deps.despawn(entity, assertWrite),
    emitEvent: (event, payload) => deps.emitEvent(event, payload),
    currentEvents: (event) => deps.currentEvents(event),
    previousEvents: (event) => deps.previousEvents(event),
    emitCue: (cue, payload, source) => deps.emitCue(cue, payload, source),
    rngStream: (name) => deps.rngStream(name),
    readFlowState: (def) => deps.readFlowState(def),
    requestStateChange: (def, next) => deps.requestStateChange(def, next),
    queueEvent: (event, payload) => deps.queueEvent(event, payload),
    restore: (snapshot) => deps.restore(snapshot),
  }
}
