import type {
  ComponentDef,
  Entity,
  QueryArg,
  SchemaShape,
  SchemaValue,
  TagDef,
  Vec2,
  AnyTypeDef,
} from '@lunego/core'

export type RenderLayer = 'background' | 'tiles' | 'entities' | 'foreground'

export const RENDER_LAYERS: readonly RenderLayer[] = [
  'background',
  'tiles',
  'entities',
  'foreground',
]

export interface DisplaySpec {
  readonly kind: 'rect'
  x: number
  y: number
  width: number
  height: number
  color: number
  visible: boolean
  alpha: number
}

export interface RenderSource {
  readonly alpha: number
  entities(...args: QueryArg[]): readonly Entity[]
  get<S extends SchemaShape>(
    entity: Entity,
    component: ComponentDef<S>,
  ): SchemaValue<S> | undefined
  prev<S extends SchemaShape>(
    entity: Entity,
    component: ComponentDef<S>,
  ): SchemaValue<S> | undefined
  has(entity: Entity, target: ComponentDef | TagDef): boolean
}

export interface EntityView {
  readonly entity: Entity
  readonly alpha: number
  get<S extends SchemaShape>(component: ComponentDef<S>): SchemaValue<S> | undefined
  prev<S extends SchemaShape>(component: ComponentDef<S>): SchemaValue<S> | undefined
  has(target: ComponentDef | TagDef): boolean
  lerp(component: ComponentDef<{ readonly x: AnyTypeDef; readonly y: AnyTypeDef }>): Vec2
}

export interface RenderBinding {
  readonly query: readonly (ComponentDef | TagDef)[]
  readonly layer?: RenderLayer
  readonly sortByY?: boolean
  create(view: EntityView): DisplaySpec
  update(object: DisplaySpec, view: EntityView): void
  destroy?(object: DisplaySpec, view: EntityView): void
}

export interface RenderAdapter<Handle> {
  create(spec: DisplaySpec): Handle
  update(handle: Handle, spec: DisplaySpec): void
  destroy(handle: Handle): void
  attach(layer: RenderLayer, handle: Handle): void
  detach(handle: Handle): void
  order(layer: RenderLayer, handles: readonly Handle[]): void
  setCamera(x: number, y: number): void
}

export function defineRenderBinding(binding: RenderBinding): RenderBinding {
  return binding
}

export function rectSpec(
  width: number,
  height: number,
  color: number,
): DisplaySpec {
  return {
    kind: 'rect',
    x: 0,
    y: 0,
    width,
    height,
    color,
    visible: true,
    alpha: 1,
  }
}
