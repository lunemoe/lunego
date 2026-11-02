import type {
  CommandDef,
  ComponentDef,
  CueDef,
  EventDef,
  FeatureRegistry,
  FlowStateDef,
  HandlerDef,
  InvariantDef,
  ModelDef,
  QueryDef,
  SystemDef,
  TagDef,
} from './definitions.js'
import { definitionName } from './names.js'

export interface FeatureSchema {
  readonly components?: readonly ComponentDef[]
  readonly tags?: readonly TagDef[]
  readonly models?: readonly ModelDef[]
  readonly events?: readonly EventDef[]
  readonly cues?: readonly CueDef[]
  readonly commands?: readonly CommandDef[]
  readonly states?: readonly FlowStateDef[]
}

export interface NormalizedFeatureSchema {
  readonly components: readonly ComponentDef[]
  readonly tags: readonly TagDef[]
  readonly models: readonly ModelDef[]
  readonly events: readonly EventDef[]
  readonly cues: readonly CueDef[]
  readonly commands: readonly CommandDef[]
  readonly states: readonly FlowStateDef[]
}

export interface FeatureDefinition {
  readonly name: string
  readonly deps?: readonly FeatureDef[]
  readonly schema?: FeatureSchema
  readonly systems?: readonly SystemDef[]
  readonly handlers?: readonly HandlerDef[]
  readonly queries?: readonly QueryDef[]
  readonly invariants?: readonly InvariantDef[]
  readonly registry?: FeatureRegistry
}

export interface FeatureDef {
  readonly kind: 'feature'
  readonly name: string
  readonly deps: readonly FeatureDef[]
  readonly schema: NormalizedFeatureSchema
  readonly systems: readonly SystemDef[]
  readonly handlers: readonly HandlerDef[]
  readonly queries: readonly QueryDef[]
  readonly invariants: readonly InvariantDef[]
}

function normalizeSchema(schema: FeatureSchema | undefined): NormalizedFeatureSchema {
  return {
    components: [...(schema?.components ?? [])],
    tags: [...(schema?.tags ?? [])],
    models: [...(schema?.models ?? [])],
    events: [...(schema?.events ?? [])],
    cues: [...(schema?.cues ?? [])],
    commands: [...(schema?.commands ?? [])],
    states: [...(schema?.states ?? [])],
  }
}

export function defineFeature(def: FeatureDefinition): FeatureDef {
  return {
    kind: 'feature',
    name: definitionName(def.name, 'feature'),
    deps: [...(def.deps ?? [])],
    schema: normalizeSchema(def.schema),
    systems: [...(def.systems ?? []), ...(def.registry?.systems ?? [])],
    handlers: [...(def.handlers ?? []), ...(def.registry?.handlers ?? [])],
    queries: [...(def.queries ?? []), ...(def.registry?.queries ?? [])],
    invariants: [...(def.invariants ?? []), ...(def.registry?.invariants ?? [])],
  }
}
