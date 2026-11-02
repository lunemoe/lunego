import { describe, expect, it } from 'vitest'
import { InputActions, createInput, type KeyEventLike, type KeyboardTarget } from '../index.js'

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
