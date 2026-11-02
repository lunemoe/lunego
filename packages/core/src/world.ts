import type {
  CommandDef,
  CommandOutcome,
  CommandPayload,
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
import { LuneGoError } from './errors.js'
import { WorldCatalog } from './catalog.js'
import { EntityStore, entityIndex } from './ecs/entity-store.js'
import { buildComponentView, type ViewAccess } from './ecs/component-store.js'
import { StructuralQueue } from './structural.js'
import { CommandQueue } from './commands.js'
import { queryEntities } from './query.js'
import { hashWorld } from './world-hash.js'
import {
  SNAPSHOT_FORMAT_VERSION,
  restoreWorld,
  snapshotWorld,
  type WorldSnapshot,
} from './snapshot.js'
import {
  type CommandEnvelope,
  type CueInstance,
  type Frame,
  type SendOptions,
} from './world-types.js'
import {
  type ComponentView,
  type ContentId,
  type ContentTypeDef,
  type DeepReadonly,
  type Entity,
  type PersistScope,
  type SchemaShape,
  type SchemaValue,
} from './schema.js'
import { ContentRegistry } from './content.js'
import { createModelProxy } from './model.js'
import { RngRegistry, type RngStream } from './rng.js'
import type { Diagnostic } from './scheduler.js'
import { EventState } from './event-state.js'
import { checkInvariants, executeCommands, executeQuery, executeSystem } from './execution.js'
import { sendCommand } from './send-command.js'
import type { RestoreOptions, WorldOptions } from './world-options.js'

export type { RestoreOptions, WorldOptions } from './world-options.js'

export type { CommandSource, FrameEvent } from './world-types.js'
export type { CommandEnvelope, CueInstance, Frame, SendOptions }
export { SNAPSHOT_FORMAT_VERSION }
export type { WorldSnapshot }
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
  private readonly commands = new CommandQueue()
  private readonly onDiagnostic: ((diagnostic: Diagnostic) => void) | null
  private readonly diagnosticLog: Diagnostic[] = []
  private readonly eventState = new EventState()
  private tickValue = 0
  private stepping = false
  private readonly queryState = { depth: 0 }
  private failure: Error | null = null

  constructor(options: WorldOptions) {
    this.dev = options.dev ?? true
    this.dt = options.dt ?? 1 / 60
    this.schemaVersion = options.schemaVersion ?? 1
    this.onDiagnostic = options.onDiagnostic ?? null
    this.content = options.content ?? new ContentRegistry()
    this.rng = new RngRegistry(options.seed ?? 1)
    if (!Number.isFinite(this.dt) || this.dt <= 0) {
      throw new LuneGoError('world_invalid', 'dt must be a positive finite number')
    }
    if (!Number.isInteger(this.schemaVersion) || this.schemaVersion < 1) {
      throw new LuneGoError('world_invalid', 'schemaVersion must be a positive integer')
    }
    this.catalog = new WorldCatalog(options.features, (diagnostic) => {
      this.diagnosticLog.push(diagnostic)
      this.onDiagnostic?.(diagnostic)
    })
    this.structural = new StructuralQueue(this.catalog, this.entityStore)
  }

  get tick(): number { return this.tickValue }
  get seed(): number { return this.rng.seed }
  get features(): readonly string[] { return this.catalog.featureList.map((feature) => feature.name) }
  get frame(): Frame { return this.eventState.frame }

  get diagnostics(): readonly Diagnostic[] {
    return this.diagnosticLog
  }

  get commandLog(): readonly CommandEnvelope[] {
    return this.commands.entries
  }

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
      executeCommands(this, this.catalog, this.commands.take(this.tickValue))
      for (const phase of ['pre', 'update', 'post'] as const) {
        for (const system of this.catalog.schedule[phase]) {
          executeSystem(this, this.catalog, system)
        }
      }
      this.structural.flush(true)
      const patches = this.catalog.commitModels()
      if (this.dev) {
        checkInvariants(this, this.catalog)
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

  queueEvent<E extends EventDef>(event: E, payload: EventPayload<E>): void {
    if (this.stepping) {
      throw new LuneGoError('nested_event', 'events cannot be injected inside a tick', {
        rule: 'LG004',
      })
    }
    this.eventState.queue(event, payload, this.catalog)
  }

  currentEvents<E extends EventDef>(event: E): ReadonlyArray<EventPayload<E>> {
    this.catalog.assertEventRegistered(event)
    return this.eventState.currentEvents(event)
  }

  previousEvents<E extends EventDef>(event: E): ReadonlyArray<EventPayload<E>> {
    this.catalog.assertEventRegistered(event)
    return this.eventState.previousEvents(event)
  }

  emitEvent<E extends EventDef>(event: E, payload: EventPayload<E>): void {
    this.eventState.emit(event, payload, this.catalog)
  }

  emitCue<C extends CueDef>(cue: C, payload: CuePayload<C>, source: string): void {
    this.eventState.emitCue(cue, payload, source, this.tickValue, this.catalog)
  }

  spawnFromContext(
    components: Readonly<Record<string, unknown>>,
    assertWrite: (name: string) => void,
  ): Entity {
    return this.structural.spawn(components, assertWrite)
  }

  addFromContext(entity: Entity, target: ComponentDef | TagDef, value: unknown): void {
    this.structural.add(entity, target, value)
  }

  removeFromContext(entity: Entity, target: ComponentDef | TagDef): void {
    this.structural.remove(entity, target)
  }

  despawnFromContext(entity: Entity, assertWrite: (name: string) => void): void {
    this.structural.despawn(entity, assertWrite)
  }

  hasComponent(entity: Entity, target: ComponentDef | TagDef): boolean {
    const store = this.catalog.storeForDef(target)
    return this.entityStore.isAlive(entity) && store.has(entityIndex(entity))
  }

  get<S extends SchemaShape>(
    entity: Entity,
    component: ComponentDef<S>,
  ): SchemaValue<S> | undefined {
    const store = this.catalog.storeForDef(component)
    if (!this.entityStore.isAlive(entity)) {
      return undefined
    }
    return store.read(entityIndex(entity)) as SchemaValue<S> | undefined
  }

  query(...args: QueryArg[]): Entity[] {
    return queryEntities(this.catalog, this.entityStore, args)
  }

  queryEntities(args: readonly QueryArg[]): Entity[] {
    return queryEntities(this.catalog, this.entityStore, args)
  }

  componentView<S extends SchemaShape>(
    component: ComponentDef<S>,
    access: ViewAccess | null,
  ): ComponentView<S> {
    const store = this.catalog.storeForDef(component)
    return buildComponentView(store, access) as ComponentView<S>
  }

  readModelValue(model: ModelDef): unknown {
    return this.catalog.readModelValue(model)
  }

  draftModelValue(model: ModelDef): unknown {
    return this.catalog.draftModelValue(model)
  }

  model<S extends SchemaShape>(model: ModelDef<S>): DeepReadonly<SchemaValue<S>> {
    return createModelProxy(
      this.catalog.readModelValue(model),
      null,
    ) as DeepReadonly<SchemaValue<S>>
  }

  contentValue<Name extends string, Value>(
    type: ContentTypeDef<Name, Value>,
    id: ContentId<Name>,
  ): Value {
    return this.content.get(type, id)
  }

  contentRegistry(): ContentRegistry {
    return this.content
  }

  rngStream(name: string): RngStream {
    return this.rng.rng(name)
  }

  runQuery<Args, Result>(query: QueryDef<Args, Result>, args: Args): Result {
    return executeQuery(this, this.catalog, this.queryState, query, args)
  }

  hash(): string {
    return hashWorld({
      catalog: this.catalog,
      entityStore: this.entityStore,
      rng: this.rng,
      tick: this.tickValue,
      schemaVersion: this.schemaVersion,
      previousEvents: this.eventState.previousList,
    })
  }

  snapshot(scope: PersistScope = 'world'): WorldSnapshot {
    return snapshotWorld(
      {
        catalog: this.catalog,
        entityStore: this.entityStore,
        rng: this.rng,
        tick: this.tickValue,
        nextSeq: this.commands.nextSeq,
        schemaVersion: this.schemaVersion,
        previousEvents: this.eventState.previousList,
      },
      scope,
    )
  }

  static fromSnapshot(snapshot: WorldSnapshot, options: RestoreOptions): World {
    const world = new World({
      features: options.features,
      seed: snapshot.rng.seed,
      schemaVersion: options.schemaVersion,
      dt: options.dt ?? 1 / 60,
      dev: options.dev ?? true,
      content: options.content ?? new ContentRegistry(),
      ...(options.onDiagnostic === undefined ? {} : { onDiagnostic: options.onDiagnostic }),
    })
    world.restore(snapshot)
    return world
  }

  private restore(snapshot: WorldSnapshot): void {
    const restored = restoreWorld({
      catalog: this.catalog,
      entityStore: this.entityStore,
      rng: this.rng,
      snapshot,
      schemaVersion: this.schemaVersion,
    })
    this.tickValue = restored.tick
    this.commands.clear()
    this.commands.restoreSequence(restored.nextSeq)
    this.structural.clear()
    this.eventState.restore(restored.previousEvents, snapshot.tick)
    this.queryState.depth = 0
    this.failure = null
  }
}
