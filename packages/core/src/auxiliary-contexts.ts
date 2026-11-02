import type {
  ComponentDef,
  FlowStateDef,
  InvariantContext,
  ModelDef,
  QueryArg,
  RunIfContext,
  TagDef,
} from './definitions.js'
import type { LogService, MathService } from './context-types.js'
import { guardError } from './errors.js'
import { createModelProxy } from './model.js'
import type { ContextHost } from './context-host.js'
import type { ComponentView, DeepReadonly, Entity, SchemaShape, SchemaValue } from './schema.js'
import type { ContextDeclarations } from './context-declarations.js'
import { logService } from './context-log.js'
import { LOGIC_MATH } from './math-service.js'

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
  private readonly declarations: ContextDeclarations
  private readonly logService: LogService

  constructor(world: ContextHost, declarations: ContextDeclarations, name: string) {
    this.world = world
    this.declarations = declarations
    this.logService = logService(world, name)
  }

  get tick(): number {
    return this.world.tick
  }

  get math(): MathService {
    return LOGIC_MATH
  }

  get log(): LogService {
    return this.logService
  }

  state<V extends string>(def: FlowStateDef<V>): V {
    if (
      this.world.dev &&
      !this.declarations.reads.has(def.name) &&
      !this.declarations.writes.has(def.name)
    ) {
      throw guardError('LG003', `runIf for ${def.name} must declare it in reads/writes`)
    }
    return this.world.readFlowState(def as FlowStateDef<string>) as V
  }

  model<S extends SchemaShape>(model: ModelDef<S>): DeepReadonly<SchemaValue<S>> {
    if (
      this.world.dev &&
      !this.declarations.reads.has(model.name) &&
      !this.declarations.writes.has(model.name)
    ) {
      throw guardError(
        'LG003',
        `runIf for ${model.name} must declare it in reads/writes`,
      )
    }
    return createModelProxy(
      this.world.readModelValue(model),
      null,
    ) as DeepReadonly<SchemaValue<S>>
  }
}
