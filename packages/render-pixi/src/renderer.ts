import type {
  ComponentDef,
  DeepReadonly,
  Entity,
  SchemaShape,
  SchemaValue,
  AnyTypeDef,
  Vec2,
} from '@lunego/core'
import type {
  DisplaySpec,
  EntityView,
  RenderAdapter,
  RenderBinding,
  RenderLayer,
  RenderSource,
} from './types.js'
import { RENDER_LAYERS } from './types.js'

interface BindingEntry {
  readonly binding: RenderBinding
  readonly objects: Map<Entity, { handle: unknown; spec: DisplaySpec }>
}

function clampAlpha(alpha: number): number {
  if (!Number.isFinite(alpha)) {
    return 1
  }
  return alpha < 0 ? 0 : alpha > 1 ? 1 : alpha
}

function entityView(source: RenderSource, entity: Entity): EntityView {
  const alpha = clampAlpha(source.alpha)
  return {
    entity,
    alpha,
    get: <S extends SchemaShape>(component: ComponentDef<S>): DeepReadonly<SchemaValue<S>> | undefined =>
      source.get(entity, component),
    prev: <S extends SchemaShape>(component: ComponentDef<S>) => source.prev(entity, component),
    has: (target) => source.has(entity, target),
    lerp(component: ComponentDef<{ readonly x: AnyTypeDef; readonly y: AnyTypeDef }>): Vec2 {
      const current = source.get(entity, component as ComponentDef) as
        | { readonly x: number; readonly y: number }
        | undefined
      if (current === undefined) {
        throw new Error(`cannot interpolate component ${component.name} for entity ${entity}`)
      }
      const previous = source.prev(entity, component as ComponentDef) as
        | { readonly x: number; readonly y: number }
        | undefined
      if (previous === undefined) {
        return { x: current.x, y: current.y }
      }
      return {
        x: previous.x + (current.x - previous.x) * alpha,
        y: previous.y + (current.y - previous.y) * alpha,
      }
    },
  }
}

/**
 * Framework-owned display lifecycle: create on first query match, update each
 * sync, destroy when the entity leaves the query. No game rules live here.
 */
export class RenderSystem<Handle> {
  private readonly adapter: RenderAdapter<Handle>
  private readonly entries: BindingEntry[] = []
  private destroyed = false

  constructor(adapter: RenderAdapter<Handle>) {
    this.adapter = adapter
  }

  add(binding: RenderBinding): this {
    this.entries.push({ binding, objects: new Map() })
    return this
  }

  sync(source: RenderSource, time = 0): void {
    if (this.destroyed) {
      return
    }
    const byLayer = new Map<RenderLayer, Array<{ handle: Handle; spec: DisplaySpec; entity: Entity; sortByY: boolean }>>()
    for (const entry of this.entries) {
      this.syncBinding(entry, source, byLayer, time)
    }
    for (const layer of RENDER_LAYERS) {
      const bucket = byLayer.get(layer)
      if (bucket === undefined) {
        this.adapter.order(layer, [])
        continue
      }
      if (bucket.some((item) => item.sortByY)) {
        bucket.sort((left, right) => {
          const leftY = left.spec.kind === 'background' ? 0 : left.spec.y
          const rightY = right.spec.kind === 'background' ? 0 : right.spec.y
          const leftX = left.spec.kind === 'background' ? 0 : left.spec.x
          const rightX = right.spec.kind === 'background' ? 0 : right.spec.x
          return leftY - rightY || leftX - rightX || left.entity - right.entity
        })
      }
      this.adapter.order(layer, bucket.map((item) => item.handle))
    }
  }

  setCamera(x: number, y: number): void {
    this.adapter.setCamera(x, y)
  }

  destroy(): void {
    if (this.destroyed) {
      return
    }
    for (const entry of this.entries) {
      for (const entity of [...entry.objects.keys()]) {
        this.remove(entry, entity)
      }
    }
    this.entries.length = 0
    this.destroyed = true
  }

  private syncBinding(
    entry: BindingEntry,
    source: RenderSource,
    byLayer: Map<RenderLayer, Array<{ handle: Handle; spec: DisplaySpec; entity: Entity; sortByY: boolean }>>,
    time: number,
  ): void {
    const entities = source.entities(...entry.binding.query)
    const active = new Set(entities)
    for (const entity of [...entry.objects.keys()]) {
      if (!active.has(entity)) {
        this.remove(entry, entity)
      }
    }
    for (const entity of entities) {
      const view = entityView(source, entity)
      let item = entry.objects.get(entity)
      if (item === undefined) {
        const spec = entry.binding.create(view)
        const handle = this.adapter.create(spec)
        item = { handle, spec }
        entry.objects.set(entity, item)
        this.adapter.attach(entry.binding.layer ?? 'entities', handle)
      }
      entry.binding.update(item.spec, view)
      const handle = item.handle as Handle
      this.adapter.update(handle, item.spec, time)
      const layer = entry.binding.layer ?? 'entities'
      const bucket = byLayer.get(layer) ?? []
      bucket.push({
        handle,
        spec: item.spec,
        entity,
        sortByY: entry.binding.sortByY ?? layer === 'entities',
      })
      byLayer.set(layer, bucket)
    }
  }

  private remove(entry: BindingEntry, entity: Entity): void {
    const item = entry.objects.get(entity)
    if (item === undefined) {
      return
    }
    const view = entityView(
      {
        alpha: 1,
        entities: () => [],
        get: <S extends SchemaShape>(_entity: number, _component: ComponentDef<S>) => undefined,
        prev: <S extends SchemaShape>(_entity: number, _component: ComponentDef<S>) => undefined,
        has: () => false,
      },
      entity,
    )
    entry.binding.destroy?.(item.spec, view)
    this.adapter.detach(item.handle as Handle)
    this.adapter.destroy(item.handle as Handle)
    entry.objects.delete(entity)
  }
}
