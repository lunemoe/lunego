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
  animatedSpec,
  animationFrameAt,
  defineRenderBinding,
  sheetFrames,
  spriteSpec,
  TextureStore,
  type DisplaySpec,
  type RenderAdapter,
  type RenderLayer,
  type RenderSource,
  type SpriteFrame,
  type TextureLoader,
  type TextureLoadResult,
  type TextureSource,
} from '../index.js'

const Position = defineComponent('DisplayPosition', { x: t.f32, y: t.f32 })
const Appearance = defineComponent('DisplayAppearance', { facing: t.i32 })

class Source implements RenderSource {
  readonly ids: Entity[] = [1]
  readonly values = new Map<Entity, { x: number; y: number }>()
  alpha = 1

  entities(..._args: QueryArg[]): readonly Entity[] {
    return this.ids
  }

  get<S extends SchemaShape>(entity: Entity, component: ComponentDef<S>): SchemaValue<S> | undefined {
    return (component === Position ? this.values.get(entity) : { facing: 1 }) as
      | SchemaValue<S>
      | undefined
  }

  prev<S extends SchemaShape>(_entity: Entity, _component: ComponentDef<S>): SchemaValue<S> | undefined {
    return undefined
  }

  has(_entity: Entity, _target: ComponentDef | TagDef): boolean {
    return true
  }
}

class Recorder implements RenderAdapter<number> {
  next = 1
  readonly specs = new Map<number, DisplaySpec>()
  readonly times = new Map<number, number>()
  readonly destroyed: number[] = []

  create(spec: DisplaySpec): number {
    const handle = this.next
    this.next += 1
    this.specs.set(handle, spec)
    return handle
  }

  update(handle: number, spec: DisplaySpec, time = 0): void {
    this.specs.set(handle, spec)
    this.times.set(handle, time)
  }

  destroy(handle: number): void {
    this.destroyed.push(handle)
  }

  attach(_layer: RenderLayer, _handle: number): void {}
  detach(_handle: number): void {}
  order(_layer: RenderLayer, _handles: readonly number[]): void {}
  setCamera(_x: number, _y: number): void {}
}

const RUN: readonly SpriteFrame[] = sheetFrames({
  frameWidth: 16,
  frameHeight: 24,
  columns: 2,
  count: 4,
})

interface FakeTexture {
  readonly id: number
  disposed: boolean
}

class FakeLoader implements TextureLoader<FakeTexture> {
  next = 1
  readonly failures = new Set<string>()
  readonly disposed: number[] = []

  async load(source: TextureSource): Promise<TextureLoadResult<FakeTexture>> {
    if (typeof source === 'string' && this.failures.has(source)) {
      throw new Error(`cannot load ${source}`)
    }
    const id = this.next
    this.next += 1
    return { texture: { id, disposed: false }, width: 32, height: 48 }
  }

  dispose(texture: FakeTexture): void {
    texture.disposed = true
    this.disposed.push(texture.id)
  }
}

describe('display specs', () => {
  it('carries sprite anchor, flip, tint and render clock through the binding', () => {
    const source = new Source()
    source.values.set(1, { x: 10, y: 20 })
    const adapter = new Recorder()
    const system = new RenderSystem(adapter)
    system.add(
      defineRenderBinding({
        query: [Position, Appearance],
        create: () => spriteSpec('hero', { anchorX: 0.5, anchorY: 1, width: 16, height: 24 }),
        update: (object, view) => {
          const position = view.lerp(Position)
          object.x = position.x
          object.y = position.y
          const appearance = view.get(Appearance)
          if (object.kind === 'animated') {
            object.frame = appearance?.facing ?? 0
          }
        },
      }),
    )
    system.sync(source, 2.5)
    const spec = adapter.specs.get(1)
    expect(spec?.kind).toBe('sprite')
    if (spec?.kind === 'sprite') {
      expect(spec.anchorY).toBe(1)
      expect(spec.texture).toBe('hero')
      expect(spec.width).toBe(16)
    }
    expect(adapter.times.get(1)).toBe(2.5)
  })

  it('selects animation frames by fps, loop and explicit frame', () => {
    const animated = animatedSpec('run', { frames: RUN, fps: 10, loop: true })
    expect(animationFrameAt(animated, RUN, 0)?.x).toBe(0)
    expect(animationFrameAt(animated, RUN, 0.15)?.x).toBe(16)
    expect(animationFrameAt(animated, RUN, 0.35)?.x).toBe(16)
    expect(animationFrameAt({ ...animated, loop: false }, RUN, 99)?.x).toBe(16)
    expect(animationFrameAt({ ...animated, frame: 1 }, RUN, 0)?.x).toBe(16)
  })

  it('slices sheets in row-major order with margin and spacing', () => {
    const frames = sheetFrames({
      frameWidth: 8,
      frameHeight: 8,
      columns: 2,
      count: 3,
      margin: 2,
      spacing: 1,
    })
    expect(frames).toEqual([
      { x: 2, y: 2, width: 8, height: 8 },
      { x: 11, y: 2, width: 8, height: 8 },
      { x: 2, y: 11, width: 8, height: 8 },
    ])
  })
})

describe('texture store', () => {
  it('loads manifests with failure isolation and releases textures', async () => {
    const loader = new FakeLoader()
    loader.failures.add('broken.png')
    const store = new TextureStore(loader)
    const report = await store.loadManifest({
      hero: { source: 'hero.png', frames: RUN },
      broken: { source: 'broken.png' },
      floor: { source: 'floor.png' },
    })
    expect(report.loaded).toEqual(['hero', 'floor'])
    expect(report.failed.map((entry) => entry.id)).toEqual(['broken'])
    expect(store.has('hero')).toBe(true)
    expect(store.get('hero')?.frames).toEqual(RUN)
    expect(store.failure('broken')).toBeInstanceOf(Error)
    expect(store.size).toBe(2)
    store.destroy()
    expect(loader.disposed).toHaveLength(2)
    expect(store.size).toBe(0)
    expect(() => store.register('again', { id: 99, disposed: false }, { width: 1, height: 1 })).toThrow(/destroyed/)
  })

  it('registers already-created textures without a loader round trip', () => {
    const store = new TextureStore(new FakeLoader())
    const texture: FakeTexture = { id: 7, disposed: false }
    store.register('runtime', texture, { width: 16, height: 16 })
    expect(store.get('runtime')?.width).toBe(16)
    expect(store.ids()).toEqual(['runtime'])
    store.destroy()
    expect(texture.disposed).toBe(true)
  })
})

describe('texture store concurrency and lifecycle', () => {
  it('deduplicates concurrent loads and disposes an in-flight texture after destroy', async () => {
    let resolveLoad: ((value: TextureLoadResult<FakeTexture>) => void) | null = null
    const disposed: number[] = []
    const loader: TextureLoader<FakeTexture> = {
      load: () => new Promise((resolve) => { resolveLoad = resolve }),
      dispose: (texture) => { disposed.push(texture.id) },
    }
    const store = new TextureStore(loader)
    const first = store.load('hero', 'hero.png')
    const second = store.load('hero', 'hero.png')
    expect(first).toBe(second)
    resolveLoad?.({ texture: { id: 5, disposed: false }, width: 16, height: 16 })
    const [a, b] = await Promise.all([first, second])
    expect(a.texture.id).toBe(5)
    expect(b.texture.id).toBe(5)
    expect(store.size).toBe(1)

    const slow = store.load('late', 'late.png')
    store.destroy()
    resolveLoad?.({ texture: { id: 6, disposed: false }, width: 8, height: 8 })
    await expect(slow).rejects.toThrow(/destroyed/)
    expect(disposed).toContain(6)
  })

  it('clears a previous failure when the id is registered later', async () => {
    const loader = new FakeLoader()
    loader.failures.add('broken')
    const store = new TextureStore(loader)
    await expect(store.load('broken', 'broken')).rejects.toThrow(/cannot load/)
    expect(store.failure('broken')).toBeInstanceOf(Error)
    store.register('broken', { id: 9, disposed: false }, { width: 4, height: 4 })
    expect(store.failure('broken')).toBeUndefined()
    expect(store.get('broken')?.width).toBe(4)
  })

  it('requires explicit dimensions when registering a texture', () => {
    const store = new TextureStore(new FakeLoader())
    expect(() =>
      store.register('zero', { id: 1, disposed: false }, { width: 0, height: 0 }),
    ).toThrow(/positive/)
    expect(() => store.register('bad', { id: 2, disposed: false }, { width: 1.5, height: 1 })).toThrow(/integers/)
  })
})
