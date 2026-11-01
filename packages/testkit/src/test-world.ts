import {
  World,
  type CommandDef,
  type CommandEnvelope,
  type CommandOutcome,
  type CommandPayload,
  type ComponentDef,
  type CueInstance,
  type Diagnostic,
  type Entity,
  type EventDef,
  type EventPayload,
  type Frame,
  type ModelDef,
  type PersistScope,
  type QueryArg,
  type RestoreOptions,
  type RngStream,
  type SendOptions,
  type TagDef,
  type WorldOptions,
  type WorldSnapshot,
} from '@lunego/core'
import type { DeepReadonly, SchemaShape, SchemaValue } from '@lunego/core'

export type TestWorldOptions = WorldOptions

export function testWorld(options: TestWorldOptions): TestWorld {
  return new TestWorld(options)
}

/**
 * Thin, deterministic test harness over World. It only adds test-facing
 * conveniences; every state change still goes through World's public paths.
 */
export class TestWorld {
  readonly world: World

  constructor(options: TestWorldOptions)
  constructor(world: World)
  constructor(input: TestWorldOptions | World) {
    this.world = input instanceof World ? input : new World(input)
  }

  static fromSnapshot(snapshot: WorldSnapshot, options: RestoreOptions): TestWorld {
    return new TestWorld(World.fromSnapshot(snapshot, options))
  }

  get tick(): number {
    return this.world.tick
  }

  get frame(): Frame {
    return this.world.frame
  }

  spawn(components: Readonly<Record<string, unknown>>): Entity {
    return this.world.spawn(components)
  }

  add<S extends SchemaShape>(entity: Entity, component: ComponentDef<S>, value: SchemaValue<S>): void
  add(entity: Entity, tag: TagDef): void
  add(entity: Entity, target: ComponentDef | TagDef, value?: unknown): void {
    if (target.kind === 'tag') {
      this.world.add(entity, target)
      return
    }
    this.world.add(entity, target, value as SchemaValue<SchemaShape>)
  }

  remove(entity: Entity, target: ComponentDef | TagDef): void {
    this.world.remove(entity, target)
  }

  despawn(entity: Entity): void {
    this.world.despawn(entity)
  }

  emit<E extends EventDef>(event: E, payload: EventPayload<E>): void {
    this.world.queueEvent(event, payload)
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
    options?: SendOptions,
  ): Promise<CommandOutcome> {
    if (typeof command === 'string') {
      return this.world.send(command, payload, options)
    }
    return this.world.send(command, payload as CommandPayload<CommandDef>, options)
  }

  step(count = 1): Frame {
    if (!Number.isInteger(count) || count < 1) {
      throw new Error('step count must be a positive integer')
    }
    for (let index = 0; index < count; index += 1) {
      this.world.step()
    }
    return this.world.frame
  }

  events<E extends EventDef>(event: E): ReadonlyArray<EventPayload<E>> {
    return this.world.frame.events
      .filter((entry) => entry.type === event.name)
      .map((entry) => entry.payload as EventPayload<E>)
  }

  cues(): readonly CueInstance[] {
    return this.world.frame.cues
  }

  get<S extends SchemaShape>(entity: Entity, component: ComponentDef<S>): SchemaValue<S> | undefined {
    return this.world.get(entity, component)
  }

  has(entity: Entity, target: ComponentDef | TagDef): boolean {
    return this.world.hasComponent(entity, target)
  }

  query(...args: QueryArg[]): Entity[] {
    return this.world.query(...args)
  }

  model<S extends SchemaShape>(model: ModelDef<S>): DeepReadonly<SchemaValue<S>> {
    return this.world.model(model)
  }

  rng(name: string): RngStream {
    return this.world.rngStream(name)
  }

  hash(): string {
    return this.world.hash()
  }

  snapshot(scope: PersistScope = 'world'): WorldSnapshot {
    return this.world.snapshot(scope)
  }

  get diagnostics(): readonly Diagnostic[] {
    return this.world.diagnostics
  }

  get commandLog(): readonly CommandEnvelope[] {
    return this.world.commandLog
  }
}
