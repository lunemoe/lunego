import type {
  CommandDef,
  ComponentDef,
  CueDef,
  EventDef,
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
}

export interface NormalizedFeatureSchema {
  readonly components: readonly ComponentDef[]
  readonly tags: readonly TagDef[]
  readonly models: readonly ModelDef[]
  readonly events: readonly EventDef[]
  readonly cues: readonly CueDef[]
  readonly commands: readonly CommandDef[]
}

export interface FeatureDefinition {
  readonly name: string
  readonly deps?: readonly FeatureDef[]
  readonly schema?: FeatureSchema
  readonly systems?: readonly SystemDef[]
  readonly handlers?: readonly HandlerDef[]
  readonly queries?: readonly QueryDef[]
  readonly invariants?: readonly InvariantDef[]
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
  }
}

export function defineFeature(def: FeatureDefinition): FeatureDef {
  return {
    kind: 'feature',
    name: definitionName(def.name, 'feature'),
    deps: [...(def.deps ?? [])],
    schema: normalizeSchema(def.schema),
    systems: [...(def.systems ?? [])],
    handlers: [...(def.handlers ?? [])],
    queries: [...(def.queries ?? [])],
    invariants: [...(def.invariants ?? [])],
  }
}
