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
  DisplayAnchor,
  DisplayBounds,
  EntityDisplaySpec,
  EntityView,
  RenderAdapter,
  RenderBinding,
  RenderLayer,
  RenderSource,
} from './types.js'
import { RENDER_LAYERS } from './types.js'

interface BindingEntry {
  readonly binding: RenderBinding
  readonly objects: Map<Entity, {
    handle: unknown
    spec: EntityDisplaySpec
    view: EntityView
    bounds: DisplayBounds
  }>
  readonly active: Set<Entity>
}

function clampAlpha(alpha: number): number {
  if (!Number.isFinite(alpha)) {
    return 1
  }
  return alpha < 0 ? 0 : alpha > 1 ? 1 : alpha
}

function fallbackBounds(spec: EntityDisplaySpec): DisplayBounds {
  const width = 'width' in spec && spec.width !== undefined ? spec.width : 0
  const height = 'height' in spec && spec.height !== undefined ? spec.height : 0
  const anchorX = spec.anchorX ?? 0
  const anchorY = spec.anchorY ?? 0
  const snap = spec.pixelSnap ?? true
  const x = snap ? Math.round(spec.x - width * anchorX) : spec.x - width * anchorX
  const y = snap ? Math.round(spec.y - height * anchorY) : spec.y - height * anchorY
  return { x, y, width, height }
}

function entityView(source: RenderSource, entity: Entity): EntityView {
  return {
    entity,
    get alpha() {
      return clampAlpha(source.alpha)
    },
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
      const alpha = clampAlpha(source.alpha)
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
export interface RenderSystemOptions {
  readonly onError?: (error: unknown) => void
}

export class RenderSystem<Handle> {
  private readonly adapter: RenderAdapter<Handle>
  private readonly onError: ((error: unknown) => void) | undefined
  private readonly entries: BindingEntry[] = []
  private destroyed = false

  constructor(adapter: RenderAdapter<Handle>, options: RenderSystemOptions = {}) {
    this.adapter = adapter
    this.onError = options.onError
  }

  add(binding: RenderBinding): this {
    if (this.destroyed) {
      throw new Error('render system is destroyed')
    }
    this.entries.push({ binding, objects: new Map(), active: new Set() })
    return this
  }

  /** `time` is seconds, shared by animated sprites; logic ticks stay separate. */
  sync(source: RenderSource, time = 0): void {
    if (this.destroyed) {
      throw new Error('render system is destroyed')
    }
    const byLayer = new Map<RenderLayer, Array<{ handle: Handle; spec: EntityDisplaySpec; entity: Entity; sortByY: boolean }>>()
    for (const layer of RENDER_LAYERS) {
      byLayer.set(layer, [])
    }
    for (const entry of this.entries) {
      try {
        this.syncBinding(entry, source, byLayer, time)
      } catch (error) {
        this.report(error)
      }
    }
    for (const layer of RENDER_LAYERS) {
      const bucket = byLayer.get(layer)
      try {
        if (bucket === undefined || bucket.length === 0) {
          this.adapter.order(layer, [])
          continue
        }
        if (bucket.some((item) => item.sortByY)) {
          bucket.sort(
            (left, right) =>
              left.spec.y - right.spec.y ||
              left.spec.x - right.spec.x ||
              left.entity - right.entity,
          )
        }
        this.adapter.order(layer, bucket.map((item) => item.handle))
      } catch (error) {
        this.report(error)
      }
    }
  }

  setCamera(x: number, y: number): void {
    this.adapter.setCamera(x, y)
  }

  boundsOf(
    entity: Entity,
    query: { readonly binding?: RenderBinding | string; readonly layer?: RenderLayer } = {},
  ): DisplayBounds | undefined {
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const entry of this.entries) {
      const item = entry.objects.get(entity)
      if (item === undefined) {
        continue
      }
      if (query.binding !== undefined) {
        const matches = typeof query.binding === 'string'
          ? entry.binding.name === query.binding
          : entry.binding === query.binding
        if (!matches) {
          continue
        }
      }
      if (query.layer !== undefined && (entry.binding.layer ?? 'entities') !== query.layer) {
        continue
      }
      minX = Math.min(minX, item.bounds.x)
      minY = Math.min(minY, item.bounds.y)
      maxX = Math.max(maxX, item.bounds.x + item.bounds.width)
      maxY = Math.max(maxY, item.bounds.y + item.bounds.height)
    }
    return Number.isFinite(minX)
      ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
      : undefined
  }

  anchorOf(
    entity: Entity,
    anchor: DisplayAnchor = 'feet',
    query: { readonly binding?: RenderBinding | string; readonly layer?: RenderLayer } = {},
  ): { readonly x: number; readonly y: number } | undefined {
    const bounds = this.boundsOf(entity, query)
    if (bounds === undefined) {
      return undefined
    }
    const centerX = bounds.x + bounds.width / 2
    if (anchor === 'center') {
      return { x: centerX, y: bounds.y + bounds.height / 2 }
    }
    if (anchor === 'top') {
      return { x: centerX, y: bounds.y }
    }
    return { x: centerX, y: bounds.y + bounds.height }
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
    byLayer: Map<RenderLayer, Array<{ handle: Handle; spec: EntityDisplaySpec; entity: Entity; sortByY: boolean }>>,
    time: number,
  ): void {
    let entities: readonly Entity[]
    try {
      entities = source.entities(...entry.binding.query)
    } catch (error) {
      this.report(error)
      return
    }
    entry.active.clear()
    for (const entity of entities) {
      entry.active.add(entity)
    }
    for (const entity of [...entry.objects.keys()]) {
      if (!entry.active.has(entity)) {
        this.remove(entry, entity)
      }
    }
    for (const entity of entities) {
      let item = entry.objects.get(entity)
      let created = false
      try {
        if (item === undefined) {
          const view = entityView(source, entity)
          const spec = entry.binding.create(view)
          const handle = this.adapter.create(spec)
          item = { handle, spec, view, bounds: fallbackBounds(spec) }
          created = true
          entry.objects.set(entity, item)
          this.adapter.attach(entry.binding.layer ?? 'entities', handle)
        }
        entry.binding.update(item.spec, item.view)
        const handle = item.handle as Handle
        this.adapter.update(handle, item.spec, time)
        item.bounds = this.adapter.measure?.(item.spec, time) ?? fallbackBounds(item.spec)
        const layer = entry.binding.layer ?? 'entities'
        const bucket = byLayer.get(layer)
        if (bucket === undefined) {
          throw new Error(`unknown render layer ${layer}`)
        }
        bucket.push({
          handle,
          spec: item.spec,
          entity,
          sortByY: entry.binding.sortByY ?? layer === 'entities',
        })
      } catch (error) {
        this.report(error)
        if (created && item !== undefined) {
          entry.objects.delete(entity)
          this.release(item.handle as Handle)
        }
      }
    }
  }

  private report(error: unknown): void {
    try {
      this.onError?.(error)
    } catch {
      // A broken error hook must not stop other render bindings.
    }
  }

  private release(handle: Handle): void {
    try {
      this.adapter.detach(handle)
    } catch (error) {
      this.report(error)
    }
    try {
      this.adapter.destroy(handle)
    } catch (error) {
      this.report(error)
    }
  }

  private remove(entry: BindingEntry, entity: Entity): void {
    const item = entry.objects.get(entity)
    if (item === undefined) {
      return
    }
    const view = item.view
    try {
      entry.binding.destroy?.(item.spec, view)
    } catch (error) {
      this.report(error)
    } finally {
      entry.objects.delete(entity)
      this.release(item.handle as Handle)
    }
  }

}
