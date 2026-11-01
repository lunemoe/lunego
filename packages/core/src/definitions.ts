import { LuneGoError } from './errors.js'
import type {
  HandlerContext,
  InvariantContext,
  QueryContext,
  RunIfContext,
  SystemContext,
} from './context-types.js'
import type { PersistScope, SchemaShape, SchemaValue } from './schema.js'

export type StateDef = ComponentDef | TagDef | ModelDef

export interface ComponentOptions {
  readonly persist?: PersistScope
  readonly replicate?: boolean
  readonly writers?: readonly string[]
  readonly interpolate?: boolean
}

export interface NormalizedComponentOptions {
  readonly persist: PersistScope | null
  readonly replicate: boolean
  readonly writers: readonly string[]
  readonly interpolate: boolean
}

export interface ComponentDef<S extends SchemaShape = SchemaShape> {
  readonly kind: 'component'
  readonly name: string
  readonly schema: S
  readonly options: NormalizedComponentOptions
}

export interface TagDef {
  readonly kind: 'tag'
  readonly name: string
  readonly options: NormalizedComponentOptions
}

export interface ModelOptions {
  readonly persist?: PersistScope
  readonly writers?: readonly string[]
}

export interface NormalizedModelOptions {
  readonly persist: PersistScope | null
  readonly writers: readonly string[]
}

export interface ModelDef<S extends SchemaShape = SchemaShape> {
  readonly kind: 'model'
  readonly name: string
  readonly schema: S
  readonly initial: SchemaValue<S>
  readonly options: NormalizedModelOptions
}

export interface EventDef<S extends SchemaShape | null = SchemaShape | null> {
  readonly kind: 'event'
  readonly name: string
  readonly schema: S
}

export interface CueDef<S extends SchemaShape = SchemaShape> {
  readonly kind: 'cue'
  readonly name: string
  readonly schema: S
}

export interface CommandDef<S extends SchemaShape = SchemaShape> {
  readonly kind: 'command'
  readonly type: string
  readonly schema: S
}

export interface QueryDefinition<Args, Result> {
  readonly name: string
  readonly reads?: readonly StateDef[]
  readonly run: (ctx: QueryContext, args: Args) => Result
}

export interface QueryDef<Args = unknown, Result = unknown> {
  readonly kind: 'query'
  readonly name: string
  readonly reads: readonly StateDef[]
  readonly run: (ctx: QueryContext, args: Args) => Result
}

export type Phase = 'pre' | 'update' | 'post'

export interface NormalizedListenSpec {
  readonly event: EventDef
  readonly prev: boolean
}

export type ListenSpec = EventDef | { readonly event: EventDef; readonly prev: true }

export interface SystemDefinition {
  readonly name: string
  readonly phase: Phase
  readonly reads?: readonly StateDef[]
  readonly writes?: readonly StateDef[]
  readonly emits?: readonly EventDef[]
  readonly listens?: readonly ListenSpec[]
  readonly cues?: readonly CueDef[]
  readonly after?: readonly SystemDef[]
  readonly before?: readonly SystemDef[]
  readonly runIf?: (ctx: RunIfContext) => boolean
  readonly run: (ctx: SystemContext) => void
}

export interface SystemDef {
  readonly kind: 'system'
  readonly name: string
  readonly phase: Phase
  readonly reads: readonly StateDef[]
  readonly writes: readonly StateDef[]
  readonly emits: readonly EventDef[]
  readonly listens: readonly NormalizedListenSpec[]
  readonly cues: readonly CueDef[]
  readonly after: readonly SystemDef[]
  readonly before: readonly SystemDef[]
  readonly runIf: ((ctx: RunIfContext) => boolean) | null
  readonly run: (ctx: SystemContext) => void
}

export type CommandOutcome =
  | { readonly status: 'ok' }
  | { readonly status: 'rejected'; readonly reason: string }

export function ok(): CommandOutcome {
  return { status: 'ok' }
}

export function reject(reason: string): CommandOutcome {
  if (reason.length === 0) {
    throw new LuneGoError('invalid_result', 'reject() requires a non-empty reason')
  }
  return { status: 'rejected', reason }
}

export interface HandlerDefinition<C extends CommandDef> {
  readonly reads?: readonly StateDef[]
  readonly writes?: readonly StateDef[]
  readonly emits?: readonly EventDef[]
  readonly cues?: readonly CueDef[]
  readonly run: (ctx: HandlerContext, payload: CommandPayload<C>) => CommandOutcome
}

export interface HandlerDef<C extends CommandDef = CommandDef> {
  readonly kind: 'handler'
  readonly command: C
  readonly reads: readonly StateDef[]
  readonly writes: readonly StateDef[]
  readonly emits: readonly EventDef[]
  readonly cues: readonly CueDef[]
  readonly run: (ctx: HandlerContext, payload: CommandPayload<C>) => CommandOutcome
}

export interface InvariantDefinition {
  readonly name: string
  readonly check: (ctx: InvariantContext) => string | null
}

export interface InvariantDef {
  readonly name: string
  readonly check: (ctx: InvariantContext) => string | null
}

export type {
  FeatureDef,
  FeatureDefinition,
  FeatureSchema,
  NormalizedFeatureSchema,
} from './features.js'

export interface QueryFilter {
  readonly kind: 'without' | 'added' | 'removed'
  readonly defs: readonly (ComponentDef | TagDef)[]
}

export type QueryArg = ComponentDef | TagDef | QueryFilter

export type EventPayload<E extends EventDef> = E extends EventDef<infer S>
  ? S extends SchemaShape
    ? SchemaValue<S>
    : undefined
  : never

export type CuePayload<C extends CueDef> = C extends CueDef<infer S> ? SchemaValue<S> : never

export type CommandPayload<C extends CommandDef> = C extends CommandDef<infer S>
  ? SchemaValue<S>
  : never

export type {
  BaseContext,
  HandlerContext,
  InvariantContext,
  QueryContext,
  RunIfContext,
  StructuralContext,
  SystemContext,
  TimeService,
} from './context-types.js'

import { definitionName } from './names.js'

function normalizeComponentOptions(
  options: ComponentOptions | undefined,
): NormalizedComponentOptions {
  return {
    persist: options?.persist ?? null,
    replicate: options?.replicate ?? false,
    writers: [...(options?.writers ?? [])],
    interpolate: options?.interpolate ?? false,
  }
}

export function defineComponent<const S extends SchemaShape>(
  name: string,
  schema: S,
  options: ComponentOptions = {},
): ComponentDef<S> {
  if (Object.keys(schema).length === 0) {
    throw new LuneGoError(
      'definition_invalid',
      `component ${name} has no fields; use defineTag instead`,
    )
  }
  return {
    kind: 'component',
    name: definitionName(name, 'component'),
    schema: { ...schema },
    options: normalizeComponentOptions(options),
  }
}

export function defineTag(name: string, options: ComponentOptions = {}): TagDef {
  return {
    kind: 'tag',
    name: definitionName(name, 'tag'),
    options: normalizeComponentOptions(options),
  }
}

export function defineModel<const S extends SchemaShape>(
  name: string,
  schema: S,
  initial: SchemaValue<S>,
  options: ModelOptions = {},
): ModelDef<S> {
  if (Object.keys(schema).length === 0) {
    throw new LuneGoError('definition_invalid', `model ${name} has no fields`)
  }
  return {
    kind: 'model',
    name: definitionName(name, 'model'),
    schema: { ...schema },
    initial,
    options: {
      persist: options.persist ?? null,
      writers: [...(options.writers ?? [])],
    },
  }
}

export function defineEvent(name: string): EventDef<null>
export function defineEvent<S extends SchemaShape>(name: string, schema: S): EventDef<S>
export function defineEvent(name: string, schema?: SchemaShape): EventDef<SchemaShape | null> {
  return {
    kind: 'event',
    name: definitionName(name, 'event'),
    schema: schema === undefined ? null : { ...schema },
  }
}

export function defineCue<const S extends SchemaShape>(name: string, schema: S): CueDef<S> {
  return {
    kind: 'cue',
    name: definitionName(name, 'cue'),
    schema: { ...schema },
  }
}

export function defineCommand<const S extends SchemaShape>(
  type: string,
  schema: S,
): CommandDef<S> {
  return {
    kind: 'command',
    type: definitionName(type, 'command'),
    schema: { ...schema },
  }
}

export function defineQuery<Args, Result>(def: QueryDefinition<Args, Result>): QueryDef<Args, Result> {
  return {
    kind: 'query',
    name: definitionName(def.name, 'query'),
    reads: [...(def.reads ?? [])],
    run: def.run,
  }
}

export function defineSystem(def: SystemDefinition): SystemDef {
  if (def.name.length === 0 || def.name.trim() !== def.name) {
    throw new LuneGoError('definition_invalid', 'system name must not be empty')
  }
  return {
    kind: 'system',
    name: def.name,
    phase: def.phase,
    reads: [...(def.reads ?? [])],
    writes: [...(def.writes ?? [])],
    emits: [...(def.emits ?? [])],
    listens: (def.listens ?? []).map((listen) =>
      'event' in listen
        ? { event: listen.event, prev: true }
        : { event: listen, prev: false },
    ),
    cues: [...(def.cues ?? [])],
    after: [...(def.after ?? [])],
    before: [...(def.before ?? [])],
    runIf: def.runIf ?? null,
    run: def.run,
  }
}

export function defineHandler<C extends CommandDef>(
  command: C,
  def: HandlerDefinition<C>,
): HandlerDef<C> {
  return {
    kind: 'handler',
    command,
    reads: [...(def.reads ?? [])],
    writes: [...(def.writes ?? [])],
    emits: [...(def.emits ?? [])],
    cues: [...(def.cues ?? [])],
    run: def.run,
  }
}

export function defineInvariant(
  name: string,
  check: (ctx: InvariantContext) => string | null,
): InvariantDef {
  return { name: definitionName(name, 'invariant'), check }
}

export function without(...defs: readonly (ComponentDef | TagDef)[]): QueryFilter {
  return { kind: 'without', defs }
}

export function added(...defs: readonly (ComponentDef | TagDef)[]): QueryFilter {
  return { kind: 'added', defs }
}

export function removed(...defs: readonly (ComponentDef | TagDef)[]): QueryFilter {
  return { kind: 'removed', defs }
}
