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
