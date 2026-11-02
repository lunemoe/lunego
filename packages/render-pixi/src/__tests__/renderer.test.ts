import { describe, expect, it } from 'vitest'
import {
  defineComponent,
  t,
  type ComponentDef,
  type Entity,
  type QueryArg,
  type SchemaShape,
  type SchemaValue,
  type TagDef,
} from '@lunego/core'
import {
  RenderSystem,
  defineRenderBinding,
  rectSpec,
  type DisplaySpec,
  type RenderAdapter,
  type RenderLayer,
  type RenderSource,
} from '../index.js'

const Position = defineComponent(
  'RenderPosition',
  { x: t.f32, y: t.f32 },
  { persist: 'world' },
)
const Marker = defineComponent('RenderMarker', { value: t.i32 })

class FakeSource implements RenderSource {
  readonly entitiesList: Entity[] = [1, 2]
  readonly current = new Map<Entity, { x: number; y: number }>()
  readonly previous = new Map<Entity, { x: number; y: number }>()
  alpha = 0.5

  entities(..._args: QueryArg[]): readonly Entity[] {
    return this.entitiesList
  }

  get<S extends SchemaShape>(entity: Entity, component: ComponentDef<S>): SchemaValue<S> | undefined {
    return (component === Position ? this.current.get(entity) : undefined) as
      | SchemaValue<S>
      | undefined
  }

  prev<S extends SchemaShape>(entity: Entity, component: ComponentDef<S>): SchemaValue<S> | undefined {
    return (component === Position ? this.previous.get(entity) : undefined) as
      | SchemaValue<S>
      | undefined
  }

  has(entity: Entity, _target: ComponentDef | TagDef): boolean {
    return this.current.has(entity)
  }
}

class FakeAdapter implements RenderAdapter<number> {
  next = 1
  readonly specs = new Map<number, DisplaySpec>()
  readonly layers = new Map<number, RenderLayer>()
  readonly destroyed: number[] = []
  readonly orders = new Map<RenderLayer, number[]>()
  camera = { x: 0, y: 0 }

  create(spec: DisplaySpec): number {
    const handle = this.next
    this.next += 1
    this.specs.set(handle, { ...spec })
    return handle
  }

  update(handle: number, spec: DisplaySpec): void {
    this.specs.set(handle, { ...spec })
  }

  destroy(handle: number): void {
    this.destroyed.push(handle)
  }

  attach(layer: RenderLayer, handle: number): void {
    this.layers.set(handle, layer)
  }

  detach(handle: number): void {
    this.orders.forEach((handles, layer) => {
      this.orders.set(
        layer,
        handles.filter((candidate) => candidate !== handle),
      )
    })
  }

  order(layer: RenderLayer, handles: readonly number[]): void {
    this.orders.set(layer, [...handles])
  }

  setCamera(x: number, y: number): void {
    this.camera = { x, y }
  }
}

describe('render bindings', () => {
  it('creates, interpolates, recycles and y-sorts display objects', () => {
    const source = new FakeSource()
    source.current.set(1, { x: 5, y: 10 })
    source.current.set(2, { x: 1, y: 5 })
    source.previous.set(1, { x: 5, y: 0 })
    source.previous.set(2, { x: 1, y: 3 })
    const adapter = new FakeAdapter()
    const binding = defineRenderBinding({
      query: [Position],
      create: () => rectSpec(8, 8, 0xff0000),
      update: (object, view) => {
        const position = view.lerp(Position)
        object.x = position.x
        object.y = position.y
        object.alpha = view.alpha
      },
    })
    const system = new RenderSystem(adapter)
    system.add(binding)
    system.sync(source)
    expect(adapter.specs.size).toBe(2)
    const firstIds = [...adapter.specs.keys()]
    expect(adapter.orders.get('entities')).toEqual([firstIds[1], firstIds[0]])
    expect(adapter.specs.get(firstIds[0])?.y).toBe(5)
    expect(adapter.specs.get(firstIds[1])?.y).toBe(4)

    source.current.set(1, { x: 5, y: 12 })
    system.sync(source)
    expect(adapter.specs.size).toBe(2)
    expect(adapter.specs.get(firstIds[0])?.y).toBe(6)

    source.entitiesList.splice(1, 1)
    system.sync(source)
    expect(adapter.destroyed).toContain(firstIds[1])
    expect(adapter.orders.get('entities')).toEqual([firstIds[0]])

    system.setCamera(3, 4)
    expect(adapter.camera).toEqual({ x: 3, y: 4 })
    system.destroy()
    expect(adapter.destroyed).toContain(firstIds[0])
    expect(() => system.sync(source)).toThrow(/destroyed/)
    expect(() => system.add(binding)).toThrow(/destroyed/)
  })

  it('cleans handles when a binding destroy callback throws and keeps syncing', () => {
    const source = new FakeSource()
    source.current.set(1, { x: 1, y: 1 })
    source.current.set(2, { x: 2, y: 2 })
    const adapter = new FakeAdapter()
    const errors: unknown[] = []
    const seen: Array<{ entity: number; x: number | undefined }> = []
    const system = new RenderSystem(adapter, { onError: (error) => errors.push(error) })
    system.add(
      defineRenderBinding({
        query: [Position],
        create: () => rectSpec(4, 4, 0xffffff),
        update: () => undefined,
        destroy: (object, view) => {
          seen.push({ entity: view.entity, x: view.get(Position)?.x })
          object.visible = false
          throw new Error('destroy failed')
        },
      }),
    )
    system.sync(source)
    const handles = [...adapter.specs.keys()]
    source.entitiesList.splice(0)
    expect(() => system.sync(source)).not.toThrow()
    expect(errors).toHaveLength(2)
    expect(seen.map((entry) => entry.entity)).toEqual([1, 2])
    expect(seen.map((entry) => entry.x)).toEqual([1, 2])
    expect(adapter.destroyed).toEqual(expect.arrayContaining(handles))
    expect(adapter.orders.get('entities')).toEqual([])
  })

  it('exposes entity bounds and feet/center/top anchors from the last update', () => {
    const source = new FakeSource()
    source.entitiesList.splice(1)
    source.current.set(1, { x: 5, y: 10 })
    const adapter = new FakeAdapter()
    const system = new RenderSystem(adapter)
    system.add(
      defineRenderBinding({
        query: [Position],
        create: () => rectSpec(8, 8, 0xffffff),
        update: (object, view) => {
          const position = view.lerp(Position)
          object.x = position.x
          object.y = position.y
        },
      }),
    )
    system.sync(source)
    expect(system.boundsOf(1)).toEqual({ x: 5, y: 10, width: 8, height: 8 })
    expect(system.anchorOf(1, 'feet')).toEqual({ x: 9, y: 18 })
    expect(system.anchorOf(1, 'center')).toEqual({ x: 9, y: 14 })
    expect(system.anchorOf(1, 'top')).toEqual({ x: 9, y: 10 })
    expect(system.anchorOf(99)).toBeUndefined()
  })

  it('orders each layer only once across multiple bindings', () => {
    const source = new FakeSource()
    source.current.set(1, { x: 0, y: 1 })
    source.current.set(2, { x: 0, y: 2 })
    const adapter = new FakeAdapter()
    const system = new RenderSystem(adapter)
    system.add(
      defineRenderBinding({
        query: [Position],
        create: () => rectSpec(4, 4, 0x111111),
        update: () => undefined,
      }),
    )
    system.add(
      defineRenderBinding({
        query: [Marker],
        layer: 'background',
        create: () => rectSpec(4, 4, 0x222222),
        update: () => undefined,
      }),
    )
    system.sync(source)
    expect(adapter.orders.get('entities')).toHaveLength(2)
    expect(adapter.orders.get('background')).toHaveLength(2)
    expect(adapter.orders.get('tiles')).toEqual([])
  })
})
