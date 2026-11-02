import { describe, expect, it } from 'vitest'
import {
  InputActions,
  PointerState,
  createInput,
  type KeyEventLike,
  type KeyboardTarget,
  type PointerEventLike,
  type PointerTarget,
} from '../index.js'

class FakeTarget implements KeyboardTarget {
  readonly listeners = new Map<string, Array<(event: KeyEventLike) => void>>()

  addEventListener(type: 'keydown' | 'keyup', listener: (event: KeyEventLike) => void): void {
    const list = this.listeners.get(type) ?? []
    list.push(listener)
    this.listeners.set(type, list)
  }

  removeEventListener(type: 'keydown' | 'keyup', listener: (event: KeyEventLike) => void): void {
    const list = this.listeners.get(type) ?? []
    this.listeners.set(
      type,
      list.filter((candidate) => candidate !== listener),
    )
  }

  dispatch(type: 'keydown' | 'keyup', event: KeyEventLike): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }
}

const map = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
}

describe('input mapping', () => {
  it('tracks down, pressed and released edges', () => {
    const actions = new InputActions(map)
    expect(actions.handleKeyDown('ArrowLeft')).toBe(true)
    expect(actions.isDown('left')).toBe(true)
    expect(actions.wasPressed('left')).toBe(true)
    expect(actions.handleKeyDown('ArrowLeft')).toBe(true)
    expect(actions.wasPressed('left')).toBe(true)
    actions.endFrame()
    expect(actions.wasPressed('left')).toBe(false)
    actions.handleKeyUp('ArrowLeft')
    expect(actions.wasReleased('left')).toBe(true)
    expect(actions.isDown('left')).toBe(false)
    expect(actions.handleKeyUp('KeyZ')).toBe(false)
  })

  it('supports rebinding and serialization', () => {
    const actions = new InputActions(map)
    actions.bind('left', ['KeyH'])
    expect(actions.handleKeyDown('ArrowLeft')).toBe(false)
    expect(actions.handleKeyDown('KeyH')).toBe(true)
    expect(actions.serialize()['left']).toEqual(['KeyH'])
    actions.loadMap({ left: ['KeyJ'] })
    expect(actions.handleKeyDown('KeyH')).toBe(false)
    expect(actions.handleKeyDown('KeyJ')).toBe(true)
  })

  it('maps actions to game commands and isolates the keyboard target', () => {
    const input = createInput({
      map,
      toCommands: (actions) => [
        {
          type: 'test.move',
          payload: { x: actions.axis('left', 'right'), y: actions.axis('up', 'down') },
        },
      ],
    })
    const target = new FakeTarget()
    input.attach(target)
    let prevented = 0
    target.dispatch('keydown', {
      code: 'ArrowRight',
      preventDefault: () => {
        prevented += 1
      },
    })
    target.dispatch('keydown', { code: 'ArrowDown' })
    expect(input.poll()).toEqual([{ type: 'test.move', payload: { x: 1, y: 1 } }])
    expect(prevented).toBe(1)
    target.dispatch('keyup', { code: 'ArrowRight' })
    expect(input.poll()).toEqual([{ type: 'test.move', payload: { x: 0, y: 1 } }])
    input.detach()
    target.dispatch('keydown', { code: 'ArrowLeft' })
    expect(input.poll()).toEqual([{ type: 'test.move', payload: { x: 0, y: 1 } }])
  })
})

function viewport(options: {
  cssScale?: number
  offsetX?: number
  offsetY?: number
  cameraX?: number
  cameraY?: number
  zoom?: number
} = {}) {
  const cssScale = options.cssScale ?? 1
  const offsetX = options.offsetX ?? 0
  const offsetY = options.offsetY ?? 0
  const zoom = options.zoom ?? 1
  const cameraX = (options.cameraX ?? 0)
  const cameraY = (options.cameraY ?? 0)
  return {
    cssScale,
    scale: cssScale * zoom,
    offsetX,
    offsetY,
    cameraX,
    cameraY,
    camera: { x: cameraX, y: cameraY },
    zoom,
    pixelSnap: true,
    worldToScreen: (x: number, y: number) => ({ x, y }),
    screenToWorld: (x: number, y: number) => ({
      x: cameraX + x / zoom,
      y: cameraY + y / zoom,
    }),
  }
}

class FakePointerTarget implements PointerTarget {
  readonly listeners = new Map<string, Array<(event: PointerEventLike) => void>>()

  addEventListener(type: string, listener: (event: PointerEventLike) => void): void {
    const list = this.listeners.get(type) ?? []
    list.push(listener)
    this.listeners.set(type, list)
  }

  removeEventListener(type: string, listener: (event: PointerEventLike) => void): void {
    const list = this.listeners.get(type) ?? []
    this.listeners.set(
      type,
      list.filter((candidate) => candidate !== listener),
    )
  }

  dispatch(type: string, event: PointerEventLike): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }
}

describe('pointer input', () => {
  it('tracks buttons and edges, then clears them per poll', () => {
    const pointer = new PointerState()
    pointer.handleDown({ clientX: 10, clientY: 20, button: 0, buttons: 1 })
    expect(pointer.isDown()).toBe(true)
    expect(pointer.wasPressed()).toBe(true)
    expect(pointer.screenPosition).toEqual({ x: 10, y: 20 })
    pointer.handleMove({ clientX: 12, clientY: 24, buttons: 1 })
    expect(pointer.screenPosition).toEqual({ x: 12, y: 24 })
    pointer.handleMove({ clientX: 12, clientY: 24, buttons: 0 })
    expect(pointer.wasReleased()).toBe(true)
    expect(pointer.isDown()).toBe(false)
    pointer.endFrame()
    expect(pointer.wasPressed()).toBe(false)
    expect(pointer.wasReleased()).toBe(false)
  })

  it('maps screen coordinates through viewport offset, zoom and camera', () => {
    const pointer = new PointerState()
    pointer.setViewport(viewport({ cssScale: 2, offsetX: 40, offsetY: 10, cameraX: 100, cameraY: 50 }))
    pointer.handleMove({ clientX: 60, clientY: 30 })
    expect(pointer.worldPosition).toEqual({ x: 110, y: 60 })
    pointer.setViewport(viewport({ cssScale: 2, offsetX: 40, offsetY: 10, cameraX: 200, cameraY: 100 }))
    expect(pointer.worldPosition).toEqual({ x: 210, y: 110 })
    expect(pointer.screenToWorld({ x: 0, y: 0 })).toEqual({ x: 180, y: 95 })
    expect(() => pointer.setViewport(viewport({ cssScale: 0 }))).toThrow(/cssScale/)
  })

  it('passes pointer state to command mapping and detaches cleanly', () => {
    const seen: Array<{ x: number; y: number; down: boolean }> = []
    const input = createInput({
      map,
      toCommands: (_actions, pointer) => {
        seen.push({ ...pointer.worldPosition, down: pointer.wasPressed() })
        return [{ type: 'test.aim', payload: pointer.worldPosition }]
      },
    })
    const target = new FakePointerTarget()
    input.attachPointer(target)
    target.dispatch('pointerdown', {
      clientX: 5,
      clientY: 6,
      button: 0,
      buttons: 1,
      preventDefault: () => undefined,
    })
    expect(input.poll()).toEqual([{ type: 'test.aim', payload: { x: 5, y: 6 } }])
    expect(seen[0]).toEqual({ x: 5, y: 6, down: true })
    target.dispatch('pointerup', { clientX: 5, clientY: 6, button: 0 })
    expect(input.poll()).toEqual([{ type: 'test.aim', payload: { x: 5, y: 6 } }])
    expect(seen[1]?.down).toBe(false)
    input.detachPointer()
    target.dispatch('pointerdown', { clientX: 9, clientY: 9, button: 0, buttons: 1 })
    expect(seen).toHaveLength(2)
  })
})
