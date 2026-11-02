import type {
  CommandDef,
  CommandOutcome,
  CommandPayload,
  ComponentDef,
  ModelDef,
  QueryArg,
  QueryDef,
  TagDef,
} from './definitions.js'
import { LuneGoError } from './errors.js'
import { WorldCatalog } from './catalog.js'
import { EntityStore, entityIndex } from './ecs/entity-store.js'
import { buildComponentView, type ViewAccess } from './ecs/component-store.js'
import { StructuralQueue } from './structural.js'
import { CommandQueue } from './commands.js'
import { queryEntities } from './query.js'
import { SNAPSHOT_FORMAT_VERSION, type WorldSnapshot } from './snapshot.js'
import {
  type CommandEnvelope,
  type CueInstance,
  type Frame,
  type SendOptions,
} from './world-types.js'
import {
  type ComponentView,
  type DeepReadonly,
  type Entity,
  type PersistScope,
  type SchemaShape,
  type SchemaValue,
} from './schema.js'
import { ContentRegistry } from './content.js'
import { cloneDeep } from './schema-coerce.js'
import { INTERNALS, type WorldInternals } from './world-internals.js'
import { createModelProxy } from './model.js'
import { RngRegistry, type RngStream } from './rng.js'
import type { Diagnostic } from './scheduler.js'
import type { LogEntry } from './context-types.js'
import { EventState } from './event-state.js'
import {
  applyStateTransitions,
  checkInvariants,
  executeCommands,
  executeQuery,
  executeSystem,
  type PendingStateTransition,
} from './execution.js'
import { sendCommand } from './send-command.js'
import {
  restoreIntoWorld,
  warnEphemeralStates,
  worldHash,
  worldSnapshot,
  type WorldPersistenceSource,
} from './world-persistence.js'
import { flowStateRuntime } from './flow-state-registry.js'
import { createWorldContextHost } from './world-context-host.js'
import { assertNotStepping } from './world-internals.js'
import { worldFromSnapshot, worldFromSnapshots } from './world-restore.js'
import { assertWorldOptions, type RestoreOptions, type WorldOptions } from './world-options.js'

export type { RestoreOptions, WorldOptions } from './world-options.js'

export type { CommandSource, FrameEvent } from './world-types.js'
export type { CommandEnvelope, CueInstance, Frame, SendOptions }
export { SNAPSHOT_FORMAT_VERSION }
export type { WorldSnapshot }
export type { SnapshotScope } from './snapshot.js'
export type {
  SnapshotComponentEntry,
  SnapshotComponentState,
  SnapshotEvent,
  SnapshotRng,
} from './snapshot.js'

export class World {
  readonly dev: boolean
  readonly dt: number
  readonly schemaVersion: number
  private readonly catalog: WorldCatalog
  private readonly entityStore = new EntityStore()
  private readonly rng: RngRegistry
  private readonly content: ContentRegistry
  private readonly structural: StructuralQueue
  readonly [INTERNALS]: WorldInternals
  private readonly internals: WorldInternals
  private readonly contentHashValue: string
  private readonly persistence: WorldPersistenceSource
  private readonly ephemeralWarned = new Set<string>()
  private readonly commands = new CommandQueue()
  private readonly onDiagnostic: ((diagnostic: Diagnostic) => void) | null
  private readonly onLog: ((entry: LogEntry) => void) | null
  private readonly diagnosticLog: Diagnostic[] = []
  private readonly eventState = new EventState()
  private readonly stateTransitions: PendingStateTransition[] = []
  private tickValue = 0
  private stepping = false
  private readonly queryState = { depth: 0 }
  private failure: Error | null = null

  constructor(options: WorldOptions) {
    this.dev = options.dev ?? true
    this.dt = options.dt ?? 1 / 60
    this.schemaVersion = options.schemaVersion ?? 1
    this.onDiagnostic = options.onDiagnostic ?? null
    this.onLog = options.onLog ?? null
    this.content = options.content ?? new ContentRegistry()
    this.rng = new RngRegistry(options.seed ?? 1)
    assertWorldOptions(this.dt, this.schemaVersion)
    this.catalog = new WorldCatalog(options.features, (diagnostic) => {
      this.diagnosticLog.push(diagnostic)
      this.onDiagnostic?.(diagnostic)
    })
    this.structural = new StructuralQueue(this.catalog, this.entityStore)
    this.contentHashValue = this.content.fingerprint()
    const world = this
    this.persistence = {
      catalog: this.catalog,
      entityStore: this.entityStore,
      rng: this.rng,
      commands: this.commands,
      structural: this.structural,
      eventState: this.eventState,
      contentHash: this.contentHashValue,
      schemaVersion: this.schemaVersion,
      dt: this.dt,
      get tick() { return world.tickValue },
      set tick(value: number) { world.tickValue = value },
      get failure() { return world.failure },
      set failure(value: Error | null) { world.failure = value },
      resetQueryDepth: () => { world.queryState.depth = 0 },
      report: (diagnostic) => {
        world.diagnosticLog.push(diagnostic)
        world.onDiagnostic?.(diagnostic)
      },
      hasWarned: (name) => world.ephemeralWarned.has(name),
      markWarned: (name) => world.ephemeralWarned.add(name),
    }
    this.internals = this.createContextHost()
    this[INTERNALS] = this.internals
  }

  get tick(): number { return this.tickValue }
  get seed(): number { return this.rng.seed }
  get features(): readonly string[] { return this.catalog.featureList.map((feature) => feature.name) }
  get frame(): Frame { return this.eventState.frame }

  get diagnostics(): readonly Diagnostic[] { return [...this.diagnosticLog] }
  get commandLog(): readonly CommandEnvelope[] { return [...this.commands.entries] }

  get failed(): boolean {
    return this.failure !== null
  }

  get pendingCommandCount(): number {
    return this.commands.pendingCount
  }

  send<C extends CommandDef>(
    command: C,
    payload: CommandPayload<C>,
    options?: SendOptions,
  ): Promise<CommandOutcome>
  send(type: string, payload: unknown, options?: SendOptions): Promise<CommandOutcome>
  send(
    command: CommandDef | string,
    payload: unknown,
    options: SendOptions = {},
  ): Promise<CommandOutcome> {
    return sendCommand(
      {
        catalog: this.catalog,
        commands: this.commands,
        tick: this.tickValue,
        stepping: this.stepping,
        failure: this.failure,
      },
      command,
      payload,
      options,
    )
  }

  step(): Frame {
    if (this.failure !== null) {
      throw this.failure
    }
    if (this.stepping) {
      throw new LuneGoError('nested_step', 'world.step() is already running', { rule: 'LG004' })
    }
    this.tickValue += 1
    this.stepping = true
    this.eventState.beginTick()
    try {
      executeCommands(this.internals, this.catalog, this.commands.take(this.tickValue))
      for (const phase of ['pre', 'update', 'post'] as const) {
        for (const system of this.catalog.schedule[phase]) {
          executeSystem(this.internals, this.catalog, system)
        }
      }
      this.structural.flush(true)
      applyStateTransitions(this.internals, this.catalog, this.stateTransitions.splice(0))
      this.structural.flush(false)
      const patches = this.catalog.commitModels(this.dev)
      if (this.dev) {
        checkInvariants(this.internals, this.catalog)
      }
      return this.eventState.finish(this.tickValue, patches)
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error))
      this.failure = failure
      this.commands.rejectAll(failure)
      throw error
    } finally {
      this.stepping = false
    }
  }

  spawn(components: Readonly<Record<string, unknown>>): Entity {
    if (this.stepping) {
      throw new LuneGoError('nested_spawn', 'world.spawn() cannot run inside a tick', {
        rule: 'LG004',
      })
    }
    const entity = this.structural.spawn(components, () => undefined)
    this.structural.flush(false)
    return entity
  }

  add<S extends SchemaShape>(entity: Entity, component: ComponentDef<S>, value: SchemaValue<S>): void
  add(entity: Entity, tag: TagDef): void
  add(entity: Entity, target: ComponentDef | TagDef, value?: unknown): void {
    if (this.stepping) {
      throw new LuneGoError('nested_add', 'world.add() cannot run inside a tick', {
        rule: 'LG004',
      })
    }
    this.structural.add(entity, target, value)
    this.structural.flush(false)
  }

  remove(entity: Entity, target: ComponentDef | TagDef): void {
    if (this.stepping) {
      throw new LuneGoError('nested_remove', 'world.remove() cannot run inside a tick', {
        rule: 'LG004',
      })
    }
    this.structural.remove(entity, target)
    this.structural.flush(false)
  }

  despawn(entity: Entity): void {
    if (this.stepping) {
      throw new LuneGoError('nested_despawn', 'world.despawn() cannot run inside a tick', {
        rule: 'LG004',
      })
    }
    this.structural.despawn(entity, () => undefined)
    this.structural.flush(false)
  }

  hasComponent(entity: Entity, target: ComponentDef | TagDef): boolean {
    const store = this.catalog.storeForDef(target)
    return this.entityStore.isAlive(entity) && store.has(entityIndex(entity))
  }

  get<S extends SchemaShape>(
    entity: Entity,
    component: ComponentDef<S>,
  ): DeepReadonly<SchemaValue<S>> | undefined {
    const store = this.catalog.storeForDef(component)
    if (!this.entityStore.isAlive(entity)) {
      return undefined
    }
    return cloneDeep(store.read(entityIndex(entity))) as DeepReadonly<SchemaValue<S>> | undefined
  }

  query(...args: QueryArg[]): Entity[] {
    return queryEntities(this.catalog, this.entityStore, args)
  }

  model<S extends SchemaShape>(model: ModelDef<S>): DeepReadonly<SchemaValue<S>> {
    return createModelProxy(
      this.catalog.readModelValue(model),
      null,
    ) as DeepReadonly<SchemaValue<S>>
  }

  rngStream(name: string): RngStream {
    return this.rng.rng(name)
  }

  runQuery<Args, Result>(query: QueryDef<Args, Result>, args: Args): Result {
    return this.runQueryInternal(query, args)
  }

  private createContextHost(): WorldInternals {
    return createWorldContextHost({
      dev: this.dev,
      dt: this.dt,
      tick: () => this.tickValue,
      log: (level, context, message, data) => {
        this.onLog?.({ level, context, tick: this.tickValue, message, data })
      },
      componentView: (component, access) => this.componentViewFor(component, access),
      hasComponent: (entity, target) => this.hasComponent(entity, target),
      queryEntities: (args) => queryEntities(this.catalog, this.entityStore, args),
      readModelValue: (model) => this.catalog.readModelValue(model),
      draftModelValue: (model) => this.catalog.draftModelValue(model),
      contentValue: (type, id) => this.content.get(type, id),
      runQuery: (query, args) => this.runQueryInternal(query, args),
      spawn: (components, assertWrite) => this.structural.spawn(components, assertWrite),
      add: (entity, target, value) => this.structural.add(entity, target, value),
      remove: (entity, target) => this.structural.remove(entity, target),
      despawn: (entity, assertWrite) => this.structural.despawn(entity, assertWrite),
      emitEvent: (event, payload) => this.eventState.emit(event, payload, this.catalog),
      currentEvents: (event) => this.eventState.currentEvents(event),
      previousEvents: (event) => this.eventState.previousEvents(event),
      emitCue: (cue, payload, source) =>
        this.eventState.emitCue(cue, payload, source, this.tickValue, this.catalog),
      rngStream: (name) => this.rng.rng(name),
      readFlowState: (def) => flowStateRuntime(this.catalog, def).current,
      requestStateChange: (def, next) => {
        const runtime = flowStateRuntime(this.catalog, def)
        if (!def.values.includes(next)) {
          throw new LuneGoError('state_invalid', `state ${def.name} has no value ${next}`, {
            rule: 'LG003',
          })
        }
        if (runtime.current !== next) {
          this.stateTransitions.push({ def, to: next })
        }
      },
      queueEvent: (event, payload) => {
        assertNotStepping(this.stepping, 'queueing an event')
        if (this.failure !== null) {
          throw this.failure
        }
        this.eventState.queue(event, payload, this.catalog)
      },
      restore: (snapshot) => this.restore(snapshot),
    })
  }

  private componentViewFor<S extends SchemaShape>(
    component: ComponentDef<S>,
    access: ViewAccess | null,
  ): ComponentView<S> {
    const store = this.catalog.storeForDef(component)
    return buildComponentView(
      store,
      access,
      {
        resolve: (entity) =>
          this.entityStore.isAlive(entity) ? entityIndex(entity) : undefined,
      },
      access !== null && this.dev,
    ) as ComponentView<S>
  }

  private runQueryInternal<Args, Result>(query: QueryDef<Args, Result>, args: Args): Result {
    return executeQuery(this.internals, this.catalog, this.queryState, query, args)
  }

  hash(): string {
    assertNotStepping(this.stepping, 'hash')
    return worldHash(this.persistence)
  }

  snapshot(scope: PersistScope = 'world'): WorldSnapshot {
    assertNotStepping(this.stepping, 'snapshot')
    if (this.dev) {
      warnEphemeralStates(this.persistence)
    }
    return worldSnapshot(this.persistence, scope, this.dev)
  }

  static fromSnapshot(snapshot: WorldSnapshot, options: RestoreOptions): World {
    return worldFromSnapshot(snapshot, options, (worldOptions) => new World(worldOptions))
  }

  static fromSnapshots(
    snapshots: { readonly world: WorldSnapshot; readonly profile: WorldSnapshot },
    options: RestoreOptions,
  ): World {
    return worldFromSnapshots(snapshots, options, (worldOptions) => new World(worldOptions))
  }

  private restore(snapshot: WorldSnapshot): void {
    restoreIntoWorld(this.persistence, snapshot)
  }

}
