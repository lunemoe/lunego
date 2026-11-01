import type {
  ComponentDef,
  CueDef,
  CuePayload,
  EventDef,
  EventPayload,
  HandlerContext,
  InvariantContext,
  ModelDef,
  QueryArg,
  QueryContext,
  QueryDef,
  RunIfContext,
  StateDef,
  SystemContext,
  TagDef,
  TimeService,
} from './definitions.js'
import { guardError } from './errors.js'
import { createModelProxy } from './model.js'
import type { ContextHost } from './context-host.js'
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

export interface ContextDeclarations {
  readonly reads: ReadonlySet<string>
  readonly writes: ReadonlySet<string>
  readonly emits: ReadonlySet<string>
  readonly cues: ReadonlySet<string>
  readonly listenSame: ReadonlySet<string>
  readonly listenPrev: ReadonlySet<string>
}

export function declarationsFrom(
  reads: readonly StateDef[],
  writes: readonly StateDef[],
  emits: readonly EventDef[],
  cues: readonly CueDef[],
  listens: ReadonlyArray<{ readonly event: EventDef; readonly prev: boolean }> = [],
): ContextDeclarations {
  const listenSame = new Set<string>()
  const listenPrev = new Set<string>()
  for (const listen of listens) {
    if (listen.prev) {
      listenPrev.add(listen.event.name)
    } else {
      listenSame.add(listen.event.name)
    }
  }
  return {
    reads: new Set(reads.map((def) => def.name)),
    writes: new Set(writes.map((def) => def.name)),
    emits: new Set(emits.map((def) => def.name)),
    cues: new Set(cues.map((def) => def.name)),
    listenSame,
    listenPrev,
  }
}

export type ContextRole = 'system' | 'handler' | 'query'

export class RunContext
  implements SystemContext, HandlerContext, QueryContext
{
  private readonly world: ContextHost
  private readonly role: ContextRole
  private readonly contextName: string
  private readonly declarations: ContextDeclarations
  private readonly dev: boolean
  private readonly timeService: TimeService
  private active = false
  private readonly readViews = new Map<string, unknown>()
  private readonly writeViews = new Map<string, unknown>()
  private readonly writeModels = new Map<string, unknown>()

  constructor(
    world: ContextHost,
    role: ContextRole,
    contextName: string,
    declarations: ContextDeclarations,
  ) {
    this.world = world
    this.role = role
    this.contextName = contextName
    this.declarations = declarations
    this.dev = world.dev
    this.timeService = {
      tick: world.tick,
      dt: world.dt,
      elapsed: world.tick * world.dt,
    }
  }

  get tick(): number {
    return this.world.tick
  }

  get time(): TimeService {
    return this.timeService
  }

  activate(): void {
    this.active = true
  }

  deactivate(): void {
    this.active = false
    this.readViews.clear()
    this.writeViews.clear()
    this.writeModels.clear()
  }

  read<S extends SchemaShape>(component: ComponentDef<S>): ComponentView<S> {
    this.ensureActive()
    this.assertReadable(component.name)
    const cached = this.readViews.get(component.name)
    if (cached !== undefined) {
      return cached as ComponentView<S>
    }
    const view = this.world.componentView(component, null)
    this.readViews.set(component.name, view)
    return view
  }

  write<S extends SchemaShape>(component: ComponentDef<S>): ComponentView<S> {
    this.ensureActive()
    this.assertWritable(component.name)
    const cached = this.writeViews.get(component.name)
    if (cached !== undefined) {
      return cached as ComponentView<S>
    }
    const view = this.world.componentView(component, {
      assertWritable: () => {
        this.ensureActive()
      },
    })
    this.writeViews.set(component.name, view)
    return view
  }

  has(entity: Entity, target: ComponentDef | TagDef): boolean {
    this.ensureActive()
    this.assertReadable(target.name)
    return this.world.hasComponent(entity, target)
  }

  query(...args: QueryArg[]): Entity[] {
    this.ensureActive()
    return this.world.queryEntities(args)
  }

  model<S extends SchemaShape>(model: ModelDef<S>): DeepReadonly<SchemaValue<S>> {
    this.ensureActive()
    this.assertReadable(model.name)
    const value = this.world.readModelValue(model)
    return createModelProxy(value, null) as DeepReadonly<SchemaValue<S>>
  }

  mutModel<S extends SchemaShape>(model: ModelDef<S>): SchemaValue<S> {
    this.ensureActive()
    this.assertWritable(model.name)
    const cached = this.writeModels.get(model.name)
    if (cached !== undefined) {
      return cached as SchemaValue<S>
    }
    const value = this.world.draftModelValue(model)
    const proxy = createModelProxy(value, () => {
      this.ensureActive()
    })
    this.writeModels.set(model.name, proxy)
    return proxy as SchemaValue<S>
  }

  content<Name extends string, Value>(
    type: ContentTypeDef<Name, Value>,
    id: ContentId<Name>,
  ): Value {
    this.ensureActive()
    return this.world.contentValue(type, id)
  }

  call<Args, Result>(query: QueryDef<Args, Result>, args: Args): Result {
    this.ensureActive()
    return this.world.runQuery(query, args)
  }

  spawn(components: Readonly<Record<string, unknown>>): Entity {
    this.ensureActive()
    this.assertStructuralRole()
    return this.world.spawnFromContext(components, (name) => {
      this.assertWritable(name)
    })
  }

  add<S extends SchemaShape>(
    entity: Entity,
    component: ComponentDef<S>,
    value: SchemaValue<S>,
  ): void
  add(entity: Entity, tag: TagDef): void
  add(entity: Entity, target: ComponentDef | TagDef, value?: unknown): void {
    this.ensureActive()
    this.assertStructuralRole()
    this.assertWritable(target.name)
    this.world.addFromContext(entity, target, value)
  }

  remove(entity: Entity, target: ComponentDef | TagDef): void {
    this.ensureActive()
    this.assertStructuralRole()
    this.assertWritable(target.name)
    this.world.removeFromContext(entity, target)
  }

  despawn(entity: Entity): void {
    this.ensureActive()
    this.assertStructuralRole()
    this.world.despawnFromContext(entity, (name) => {
      this.assertWritable(name)
    })
  }

  emit<E extends EventDef>(event: E, payload: EventPayload<E>): void {
    this.ensureActive()
    if (this.role === 'query') {
      throw guardError('LG003', 'Query must not emit events')
    }
    this.assertDeclared(this.declarations.emits, event.name, 'emit')
    this.world.emitEvent(event, payload)
  }

  events<E extends EventDef>(event: E): ReadonlyArray<EventPayload<E>> {
    this.ensureActive()
    if (this.role !== 'system') {
      throw guardError('LG003', `Handler/Query ${this.contextName} must not read events`)
    }
    this.assertDeclared(this.declarations.listenSame, event.name, 'listen to')
    return this.world.currentEvents(event)
  }

  prev<E extends EventDef>(event: E): ReadonlyArray<EventPayload<E>> {
    this.ensureActive()
    if (this.role !== 'system') {
      throw guardError('LG003', `Handler/Query ${this.contextName} must not read events`)
    }
    this.assertDeclared(this.declarations.listenPrev, event.name, 'read previous events of')
    return this.world.previousEvents(event)
  }

  cue<Cue extends CueDef>(cue: Cue, payload: CuePayload<Cue>): void {
    this.ensureActive()
    if (this.role === 'query') {
      throw guardError('LG003', 'Query must not emit cues')
    }
    this.assertDeclared(this.declarations.cues, cue.name, 'emit cue')
    this.world.emitCue(cue, payload, this.contextName)
  }

  rng(name: string): RngStream {
    this.ensureActive()
    if (this.role === 'query') {
      throw guardError('LG003', 'Query must not advance random streams')
    }
    return this.world.rngStream(name)
  }

  private ensureActive(): void {
    if (!this.active) {
      throw guardError(
        'LG004',
        `context of ${this.role} ${this.contextName} was used outside its tick run`,
      )
    }
  }

  private assertStructuralRole(): void {
    if (this.role === 'query') {
      throw guardError('LG003', 'Query must not mutate the world')
    }
  }

  private assertReadable(name: string): void {
    if (!this.dev) {
      return
    }
    if (!this.declarations.reads.has(name) && !this.declarations.writes.has(name)) {
      throw guardError(
        'LG003',
        `${this.role} ${this.contextName} accesses ${name} without declaring it in reads/writes`,
      )
    }
  }

  private assertWritable(name: string): void {
    if (this.role === 'query') {
      throw guardError('LG003', 'Query must not write state')
    }
    if (!this.dev) {
      return
    }
    if (!this.declarations.writes.has(name)) {
      throw guardError(
        'LG003',
        `${this.role} ${this.contextName} writes ${name} without declaring it in writes`,
      )
    }
  }

  private assertDeclared(
    declared: ReadonlySet<string>,
    name: string,
    action: string,
  ): void {
    if (this.dev && !declared.has(name)) {
      throw guardError(
        'LG003',
        `${this.role} ${this.contextName} tries to ${action} ${name} without declaring it`,
      )
    }
  }
}

export class InvariantRuntimeContext implements InvariantContext {
  private readonly world: ContextHost

  constructor(world: ContextHost) {
    this.world = world
  }

  get tick(): number {
    return this.world.tick
  }

  read<S extends SchemaShape>(component: ComponentDef<S>): ComponentView<S> {
    return this.world.componentView(component, null)
  }

  has(entity: Entity, target: ComponentDef | TagDef): boolean {
    return this.world.hasComponent(entity, target)
  }

  query(...args: QueryArg[]): Entity[] {
    return this.world.queryEntities(args)
  }

  model<S extends SchemaShape>(model: ModelDef<S>): DeepReadonly<SchemaValue<S>> {
    const proxy = createModelProxy(this.world.readModelValue(model), null)
    return proxy as DeepReadonly<SchemaValue<S>>
  }
}

export class RunIfRuntimeContext implements RunIfContext {
  private readonly world: ContextHost

  constructor(world: ContextHost) {
    this.world = world
  }

  get tick(): number {
    return this.world.tick
  }

  model<S extends SchemaShape>(model: ModelDef<S>): DeepReadonly<SchemaValue<S>> {
    return createModelProxy(
      this.world.readModelValue(model),
      null,
    ) as DeepReadonly<SchemaValue<S>>
  }
}
