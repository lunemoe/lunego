import type {
  CommandDef,
  ComponentDef,
  CueDef,
  EventDef,
  FeatureDef,
  HandlerDef,
  InvariantDef,
  ModelDef,
  QueryDef,
  StateDef,
  SystemDef,
  TagDef,
} from './definitions.js'
import type { ContextDeclarations } from './context.js'
import { declarationsFrom } from './context.js'
import { registrationError, schemaError } from './errors.js'
import { ComponentStore } from './ecs/component-store.js'
import { cloneDeep, coerceValue } from './schema-coerce.js'
import { t } from './schema.js'
import { diffModel, type ModelPatch } from './model.js'
import { buildSchedule, type Diagnostic, type PhaseSchedule } from './scheduler.js'
import { collectFeatures } from './feature-graph.js'

export interface SystemBinding {
  readonly def: SystemDef
  readonly feature: string
  readonly declarations: ContextDeclarations
}

export interface HandlerBinding {
  readonly def: HandlerDef
  readonly feature: string
  readonly declarations: ContextDeclarations
}

export interface QueryBinding {
  readonly def: QueryDef
  readonly feature: string
  readonly declarations: ContextDeclarations
}

export interface InvariantBinding {
  readonly def: InvariantDef
  readonly feature: string
}

export interface ModelRuntime {
  readonly def: ModelDef
  committed: unknown
  draft: unknown | null
}

export interface RegisteredSystem {
  readonly def: SystemDef
  readonly feature: string
}

/**
 * Owns feature registration, contract validation, stores, model runtimes and
 * the schedule. It has no tick state; World drives it.
 */
export class WorldCatalog {
  readonly featureList: readonly FeatureDef[]
  readonly featureNames: ReadonlySet<string>
  readonly stateByName = new Map<string, StateDef>()
  readonly stateOwners = new Map<StateDef, string>()
  readonly allowedWriters = new Map<StateDef, ReadonlySet<string>>()
  readonly storesByName = new Map<string, ComponentStore>()
  readonly storesByDef = new Map<ComponentDef | TagDef, ComponentStore>()
  readonly modelRuntimes = new Map<ModelDef, ModelRuntime>()
  readonly eventDefs = new Map<string, EventDef>()
  readonly cueDefs = new Map<string, CueDef>()
  readonly commands = new Map<string, CommandDef>()
  readonly queries = new Map<string, QueryBinding>()
  readonly systemBindings = new Map<SystemDef, SystemBinding>()
  readonly registeredSystems: RegisteredSystem[] = []
  readonly handlerBindings = new Map<string, HandlerBinding>()
  readonly invariantBindings: InvariantBinding[] = []
  readonly schedule: PhaseSchedule

  constructor(features: readonly FeatureDef[], report: (diagnostic: Diagnostic) => void) {
    this.featureList = collectFeatures(features)
    this.featureNames = new Set(this.featureList.map((feature) => feature.name))
    for (const feature of this.featureList) {
      this.registerFeatureSchema(feature)
    }
    this.validateWriters()
    for (const feature of this.featureList) {
      for (const system of feature.systems) {
        this.registerSystem(feature, system)
      }
      for (const handler of feature.handlers) {
        this.registerHandler(feature, handler)
      }
      for (const query of feature.queries) {
        this.registerQuery(feature, query)
      }
      for (const invariant of feature.invariants) {
        this.registerInvariant(feature, invariant)
      }
    }
    this.schedule = buildSchedule(this.registeredSystems, report)
    this.validateWriteOwnership()
    this.validateCommandsHandled()
  }

  getStateDef(name: string): StateDef | undefined {
    return this.stateByName.get(name)
  }

  storeForDef(def: ComponentDef | TagDef): ComponentStore {
    const store = this.storesByDef.get(def)
    if (store === undefined) {
      throw registrationError(`component ${def.name} is not registered`)
    }
    return store
  }

  storeByName(name: string): ComponentStore | undefined {
    return this.storesByName.get(name)
  }

  assertEventRegistered(event: EventDef): void {
    if (this.eventDefs.get(event.name) !== event) {
      throw registrationError(`event ${event.name} is not registered`)
    }
  }

  assertCueRegistered(cue: CueDef): void {
    if (this.cueDefs.get(cue.name) !== cue) {
      throw registrationError(`cue ${cue.name} is not registered`)
    }
  }

  resolveCommand(command: CommandDef | string): CommandDef {
    const def = typeof command === 'string' ? this.commands.get(command) : command
    if (def === undefined || this.commands.get(def.type) !== def) {
      throw registrationError(
        `command ${typeof command === 'string' ? command : command.type} is not registered`,
      )
    }
    return def
  }

  coerceComponentValue(
    target: ComponentDef | TagDef,
    value: unknown,
  ): Record<string, unknown> {
    if (target.kind === 'tag') {
      if (value !== undefined && value !== true) {
        schemaError(target.name, 'tag value true')
      }
      return {}
    }
    return coerceValue(t.struct(target.schema), value, target.name)
  }

  coerceEventPayload(event: EventDef, payload: unknown): unknown {
    if (event.schema === null) {
      if (payload !== undefined) {
        schemaError(event.name, 'undefined payload')
      }
      return undefined
    }
    return coerceValue(t.struct(event.schema), payload, event.name)
  }

  coerceCuePayload(cue: CueDef, payload: unknown): unknown {
    return coerceValue(t.struct(cue.schema), payload, cue.name)
  }

  readModelValue(model: ModelDef): unknown {
    const runtime = this.modelRuntimes.get(model)
    if (runtime === undefined) {
      throw registrationError(`model ${model.name} is not registered`)
    }
    return runtime.draft ?? runtime.committed
  }

  draftModelValue(model: ModelDef): unknown {
    const runtime = this.modelRuntimes.get(model)
    if (runtime === undefined) {
      throw registrationError(`model ${model.name} is not registered`)
    }
    if (runtime.draft === null) {
      runtime.draft = cloneDeep(runtime.committed)
    }
    return runtime.draft
  }

  commitModels(): ModelPatch[] {
    const patches: ModelPatch[] = []
    for (const runtime of this.modelRuntimes.values()) {
      if (runtime.draft !== null) {
        patches.push(...diffModel(runtime.def.name, runtime.committed, runtime.draft))
        runtime.committed = cloneDeep(runtime.draft)
        runtime.draft = null
      }
    }
    return patches
  }

  private registerFeatureSchema(feature: FeatureDef): void {
    for (const def of feature.schema.components) {
      this.registerState(def, feature)
    }
    for (const def of feature.schema.tags) {
      this.registerState(def, feature)
    }
    for (const def of feature.schema.models) {
      this.registerState(def, feature)
    }
    for (const def of feature.schema.events) {
      if (this.eventDefs.has(def.name)) {
        throw registrationError(`duplicate event name ${def.name}`)
      }
      this.eventDefs.set(def.name, def)
    }
    for (const def of feature.schema.cues) {
      if (this.cueDefs.has(def.name)) {
        throw registrationError(`duplicate cue name ${def.name}`)
      }
      this.cueDefs.set(def.name, def)
    }
    for (const def of feature.schema.commands) {
      if (this.commands.has(def.type)) {
        throw registrationError(`duplicate command type ${def.type}`)
      }
      this.commands.set(def.type, def)
    }
  }

  private registerState<S extends StateDef>(def: S, feature: FeatureDef): void {
    if (this.stateOwners.has(def)) {
      throw registrationError(`definition ${def.name} is registered more than once`)
    }
    if (this.stateByName.has(def.name)) {
      throw registrationError(`duplicate state name ${def.name}`)
    }
    this.stateByName.set(def.name, def)
    this.stateOwners.set(def, feature.name)
    if (def.kind === 'model') {
      const initial = coerceValue(t.struct(def.schema), def.initial, def.name)
      this.modelRuntimes.set(def, {
        def,
        committed: cloneDeep(initial),
        draft: null,
      })
      return
    }
    const store: ComponentStore =
      def.kind === 'tag'
        ? new ComponentStore({ name: def.name, schema: {} })
        : new ComponentStore({ name: def.name, schema: def.schema })
    this.storesByName.set(def.name, store)
    this.storesByDef.set(def, store)
  }

  private validateWriters(): void {
    for (const def of this.stateByName.values()) {
      const owner = this.stateOwners.get(def)
      if (owner === undefined) {
        throw registrationError(`state ${def.name} has no owner feature`)
      }
      const allowed = new Set<string>([owner])
      for (const writer of def.options.writers) {
        if (!this.featureNames.has(writer)) {
          throw registrationError(
            `state ${def.name} declares unknown writer feature ${writer}`,
            'LG005',
          )
        }
        allowed.add(writer)
      }
      this.allowedWriters.set(def, allowed)
    }
  }

  private registerSystem(feature: FeatureDef, def: SystemDef): void {
    if (this.systemBindings.has(def)) {
      throw registrationError(`system ${def.name} is registered more than once`)
    }
    this.validateStateDefs(def.reads, `system ${def.name}`)
    this.validateStateDefs(def.writes, `system ${def.name}`)
    for (const event of def.emits) {
      this.assertEventRegistered(event)
    }
    for (const listen of def.listens) {
      this.assertEventRegistered(listen.event)
    }
    for (const cue of def.cues) {
      this.assertCueRegistered(cue)
    }
    this.systemBindings.set(def, {
      def,
      feature: feature.name,
      declarations: declarationsFrom(def.reads, def.writes, def.emits, def.cues, def.listens),
    })
    this.registeredSystems.push({ def, feature: feature.name })
  }

  private registerHandler(feature: FeatureDef, def: HandlerDef): void {
    if (this.commands.get(def.command.type) !== def.command) {
      throw registrationError(
        `handler in ${feature.name} targets unregistered command ${def.command.type}`,
      )
    }
    if (this.handlerBindings.has(def.command.type)) {
      throw registrationError(`duplicate handler for command ${def.command.type}`)
    }
    this.validateStateDefs(def.reads, `handler ${def.command.type}`)
    this.validateStateDefs(def.writes, `handler ${def.command.type}`)
    for (const event of def.emits) {
      this.assertEventRegistered(event)
    }
    for (const cue of def.cues) {
      this.assertCueRegistered(cue)
    }
    this.handlerBindings.set(def.command.type, {
      def,
      feature: feature.name,
      declarations: declarationsFrom(def.reads, def.writes, def.emits, def.cues),
    })
  }

  private registerQuery(feature: FeatureDef, def: QueryDef): void {
    if (this.queries.has(def.name)) {
      throw registrationError(`duplicate query name ${def.name}`)
    }
    this.validateStateDefs(def.reads, `query ${def.name}`)
    this.queries.set(def.name, {
      def,
      feature: feature.name,
      declarations: declarationsFrom(def.reads, [], [], []),
    })
  }

  private registerInvariant(feature: FeatureDef, def: InvariantDef): void {
    if (this.invariantBindings.some((binding) => binding.def.name === def.name)) {
      throw registrationError(`duplicate invariant name ${def.name}`)
    }
    this.invariantBindings.push({ def, feature: feature.name })
  }

  private validateStateDefs(defs: readonly StateDef[], context: string): void {
    for (const def of defs) {
      if (this.stateByName.get(def.name) !== def) {
        throw registrationError(`${context} references unregistered state ${def.name}`)
      }
    }
  }

  private validateWriteOwnership(): void {
    const check = (feature: string, writes: readonly StateDef[]): void => {
      for (const def of writes) {
        const allowed = this.allowedWriters.get(def)
        if (allowed === undefined) {
          throw registrationError(`state ${def.name} has no writer set`)
        }
        if (!allowed.has(feature)) {
          throw registrationError(
            `feature ${feature} writes ${def.name}, which belongs to another feature; add it to writers`,
            'LG005',
          )
        }
      }
    }
    for (const binding of this.systemBindings.values()) {
      check(binding.feature, binding.def.writes)
    }
    for (const binding of this.handlerBindings.values()) {
      check(binding.feature, binding.def.writes)
    }
  }

  private validateCommandsHandled(): void {
    for (const type of this.commands.keys()) {
      if (!this.handlerBindings.has(type)) {
        throw registrationError(`command ${type} has no handler`)
      }
    }
  }
}

