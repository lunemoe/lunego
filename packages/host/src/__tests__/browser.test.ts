import { describe, expect, it } from 'vitest'
import type { GameFrame, WorldSnapshot } from '@lunego/core'
import {
  bindBrowserKeys,
  createBrowserSaveStore,
  createViewLoop,
  exposeBrowserDebug,
  type BrowserKeyEvent,
  type BrowserKeyTarget,
  type StorageLike,
} from '../index.js'
import type { ViewLoopGame, ViewLoopScheduler, ViewLoopVisibility } from '../index.js'

function frame(tick: number): GameFrame {
  return {
    tick,
    dt: 1 / 60,
    elapsed: tick / 60,
    render: true,
    events: [],
    cues: [],
    modelPatches: [],
    models: {},
    entityCount: 0,
    hash: '0'.repeat(16),
  }
}

class FakeGame implements ViewLoopGame {
  frame = frame(0)
  alpha = 0
  paused = false
  updates: number[] = []
  steps = 1
  update(delta: number): number {
    this.updates.push(delta)
    this.frame = frame(this.frame.tick + this.steps)
    return this.steps
  }
  pause(): void {
    this.paused = true
  }
  resume(): void {
    this.paused = false
  }
}

class ManualScheduler implements ViewLoopScheduler {
  callback: ((now: number) => void) | null = null
  nowValue = 0
  nextId = 1
  cancelled: number[] = []
  request(callback: (now: number) => void): number {
    this.callback = callback
    const id = this.nextId
    this.nextId += 1
    return id
  }
  cancel(id: number): void {
    this.cancelled.push(id)
    this.callback = null
  }
  now(): number {
    return this.nowValue
  }
  advance(ms: number): void {
    this.nowValue += ms
    this.callback?.(this.nowValue)
  }
}

class ManualVisibility implements ViewLoopVisibility {
  isHidden = false
  listener: (() => void) | null = null
  hidden(): boolean {
    return this.isHidden
  }
  addEventListener(listener: () => void): void {
    this.listener = listener
  }
  removeEventListener(_listener: () => void): void {
    this.listener = null
  }
  setHidden(value: boolean): void {
    this.isHidden = value
    this.listener?.()
  }
}

describe('view loop', () => {
  it('owns RAF, delta clamping and visibility pause/resume', () => {
    const game = new FakeGame()
    const scheduler = new ManualScheduler()
    const visibility = new ManualVisibility()
    const views: Array<{ tick: number; elapsed: number; dt: number }> = []
    const loop = createViewLoop({
      game,
      scheduler,
      visibility,
      maxDeltaSeconds: 0.05,
      update: (view) => views.push({ tick: view.frame.tick, elapsed: view.elapsed, dt: view.dt }),
    })
    scheduler.advance(1000)
    expect(game.updates).toEqual([0.05])
    expect(views).toEqual([{ tick: 1, elapsed: 1 / 60, dt: 1 / 60 }])
    game.steps = 2
    scheduler.advance(16)
    expect(views[1]).toEqual({ tick: 3, elapsed: 3 / 60, dt: 2 / 60 })
    visibility.setHidden(true)
    expect(game.paused).toBe(true)
    scheduler.advance(100)
    expect(game.updates).toHaveLength(2)
    visibility.setHidden(false)
    expect(game.paused).toBe(false)
    scheduler.advance(16)
    expect(game.updates).toHaveLength(3)
    expect(views.at(-1)?.dt).toBe(2 / 60)
    const elapsed = views.at(-1)?.elapsed
    scheduler.advance(16)
    expect(views.at(-1)?.elapsed).toBeGreaterThan(elapsed ?? 0)
    loop.stop()
    scheduler.advance(16)
    expect(scheduler.cancelled).toHaveLength(1)
    expect(views).toHaveLength(5)
  })
})

describe('browser adapters', () => {
  it('saves and loads snapshots through an injected storage', () => {
    const values = new Map<string, string>()
    const storage: StorageLike = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    }
    const store = createBrowserSaveStore('save', storage)
    const snapshot = { tick: 3 } as WorldSnapshot
    store.save(snapshot)
    expect(store.load()).toEqual(snapshot)
    values.set('save', '{bad')
    expect(store.load()).toBeNull()
    store.clear()
    expect(store.load()).toBeNull()
    expect(() => createBrowserSaveStore('', storage)).toThrow(/key/)
  })

  it('binds keys and exposes/removes debug handles', () => {
    const listeners = new Map<string, (event: BrowserKeyEvent) => void>()
    const target: BrowserKeyTarget = {
      addEventListener: (type, listener) => listeners.set(type, listener),
      removeEventListener: (type) => listeners.delete(type),
    }
    let saved = 0
    const dispose = bindBrowserKeys({ KeyK: () => { saved += 1 } }, target)
    listeners.get('keydown')?.({ code: 'KeyK' })
    listeners.get('keydown')?.({ code: 'KeyK', repeat: true })
    expect(saved).toBe(1)
    dispose()
    expect(listeners.has('keydown')).toBe(false)

    const remove = exposeBrowserDebug('__luneTestDebug', { ok: true })
    expect((globalThis as Record<string, unknown>)['__luneTestDebug']).toEqual({ ok: true })
    remove()
    expect((globalThis as Record<string, unknown>)['__luneTestDebug']).toBeUndefined()
  })
})
