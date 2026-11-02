import type {
  ComponentDef,
  DeepReadonly,
  Entity,
  QueryArg,
  SchemaShape,
  SchemaValue,
  TagDef,
  World,
} from '@lunego/core'
import type { RenderSource } from './types.js'

export interface RenderSourceInput {
  readonly world: World
  readonly previousValues: ReadonlyMap<string, ReadonlyMap<Entity, unknown>>
  readonly alpha: () => number
}

export function capturePreviousValues(
  world: World,
  components: readonly ComponentDef[],
  previousValues: Map<string, ReadonlyMap<Entity, unknown>>,
): void {
  for (const component of components) {
    const values = new Map<Entity, unknown>()
    for (const entity of world.query(component)) {
      values.set(entity, world.get(entity, component))
    }
    previousValues.set(component.name, values)
  }
}

export function createRenderSource(input: RenderSourceInput): RenderSource {
  return {
    get alpha() {
      return input.alpha()
    },
    entities: (...args: QueryArg[]) => input.world.query(...args),
    get: <S extends SchemaShape>(entity: Entity, component: ComponentDef<S>) =>
      input.world.get(entity, component),
    prev: <S extends SchemaShape>(entity: Entity, component: ComponentDef<S>) =>
      input.previousValues.get(component.name)?.get(entity) as
        | DeepReadonly<SchemaValue<S>>
        | undefined,
    has: (entity: Entity, target: ComponentDef | TagDef) =>
      input.world.hasComponent(entity, target),
  }
}
