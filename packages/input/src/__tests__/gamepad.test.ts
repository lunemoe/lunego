import { describe, expect, it } from 'vitest'
import {
  GamepadSource,
  attachBrowserGamepad,
  createInput,
  createKeybindSettings,
  gamepadConflicts,
  type GamepadLike,
  type KeyEventLike,
  type KeyboardTarget,
  type PointerEventLike,
  type PointerTarget,
} from '../index.js'

class FakeTarget implements KeyboardTarget {
  private readonly listeners = new Map<string, Array<(event: KeyEventLike) => void>>()
  addEventListener(type: 'keydown' | 'keyup', listener: (event: KeyEventLike) => void): void {
    const list = this.listeners.get(type) ?? []
    list.push(listener)
    this.listeners.set(type, list)
  }
  removeEventListener(type: 'keydown' | 'keyup', listener: (event: KeyEventLike) => void): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== listener))
  }
  dispatch(type: 'keydown' | 'keyup', event: KeyEventLike): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

class FakePointerTarget implements PointerTarget {
  private readonly listeners = new Map<string, Array<(event: PointerEventLike) => void>>()
  addEventListener(type: string, listener: (event: PointerEventLike) => void): void {
    const list = this.listeners.get(type) ?? []
    list.push(listener)
    this.listeners.set(type, list)
  }
  removeEventListener(type: string, listener: (event: PointerEventLike) => void): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== listener))
  }
  dispatch(type: string, event: PointerEventLike): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

const map = { left: ['ArrowLeft'], right: ['ArrowRight'] }

describe('gamepad input', () => {
  function pad(index: number, pressed: boolean[] = [], axes: number[] = []): GamepadLike {
    return {
      index,
      id: `pad-${index}`,
      connected: true,
      buttons: pressed.map((value) => ({ pressed: value, value: value ? 1 : 0 })),
      axes,
    }
  }

  it('applies deadzone/inversion, edges and button repeat deterministically', () => {
    let buttons = [true, false]
    const source = new GamepadSource({
      provider: () => [pad(0, buttons, [0.1, 0.9, -0.4])],
      deadzone: 0.2,
      invertAxes: [1],
      repeatButtons: [0],
      repeatEveryPolls: 2,
    })
    const first = source.poll()
    expect(first.pressed).toEqual([0])
    expect(first.axes).toEqual([0, -0.9, -0.4])
    const second = source.poll()
    expect(second.repeats).toEqual([])
    const third = source.poll()
    expect(third.repeats).toEqual([0])
    buttons = [false, true]
    const fourth = source.poll()
    expect(fourth.released).toContain(0)
    expect(fourth.pressed).toContain(1)
  })

  it('selects player index and supports injected hotplug listeners', () => {
    const source = new GamepadSource({ provider: () => [pad(0), pad(1)], playerIndex: 1 })
    expect(source.availablePlayers().map((player) => player.index)).toEqual([0, 1])
    const connected = source.poll()
    expect(connected.id).toBe('pad-1')
    expect(connected.events).toEqual([{ type: 'connected', index: 1, id: 'pad-1' }])
    source.selectPlayer(0)
    expect(source.poll().id).toBe('pad-0')
    const listeners = new Map<string, (event: { gamepad: GamepadLike }) => void>()
    const target = {
      addEventListener: (type: string, listener: (event: { gamepad: GamepadLike }) => void) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    }
    const dispose = attachBrowserGamepad(source, target)
    listeners.get('gamepadconnected')?.({ gamepad: pad(2) })
    source.selectPlayer(2)
    expect(source.poll().id).toBe('pad-2')
    listeners.get('gamepaddisconnected')?.({ gamepad: pad(2) })
    expect(source.connected).toBe(false)
    dispose()
  })

  it('maps gamepad actions, honors ActionContext, and records device switches', () => {
    let buttons = [false, false, false]
    const source = new GamepadSource({ provider: () => [pad(0, buttons, [0.8])] })
    const devices: string[] = []
    const input = createInput({
      map,
      gamepad: source,
      gamepadBindings: {
        buttons: [{ action: 'jump', button: 0 }],
        axes: [{ action: 'right', axis: 0, direction: 1, threshold: 0.5 }],
      },
      onDeviceChange: (device) => devices.push(device),
      toCommands: (actions) => [
        { type: 'jump', payload: actions.wasPressed('jump') },
        { type: 'right', payload: actions.isDown('right') },
      ],
    })
    buttons = [true, false, false]
    expect(input.poll()).toEqual([
      { type: 'jump', payload: true },
      { type: 'right', payload: true },
    ])
    expect(devices).toContain('gamepad')
    const pop = input.context.push('menu')
    buttons = [false, true, false]
    expect(input.poll()).toEqual([])
    expect(input.actions.isDown('jump')).toBe(false)
    pop()
    buttons = [false, true, true]
    input.poll()
    expect(input.context.current).toBe('gameplay')
  })

  it('records keyboard/pointer device switches and exposes them for UI glyphs', () => {
    const devices: string[] = []
    const input = createInput({
      map,
      toCommands: () => [],
      onDeviceChange: (device) => devices.push(device),
    })
    const keys = new FakeTarget()
    const pointers = new FakePointerTarget()
    input.attach(keys)
    input.attachPointer(pointers)
    keys.dispatch('keydown', { code: 'KeyA', preventDefault: () => undefined })
    expect(input.device).toBe('keyboard')
    pointers.dispatch('pointerdown', { clientX: 1, clientY: 2, button: 0, buttons: 1 })
    expect(input.device).toBe('pointer')
    expect(devices).toEqual(['pointer'])
  })

  it('serializes gamepad bindings and detects button/axis conflicts', () => {
    const profile = createKeybindSettings(map, {
      bindings: map,
      uiScale: 1,
      reducedMotion: false,
      gamepad: {
        buttons: [{ action: 'jump', button: 0 }, { action: 'attack', button: 0 }],
        axes: [{ action: 'move', axis: 0, direction: 1 }],
      },
    })
    const restored = createKeybindSettings(map)
    restored.deserialize(profile.serialize())
    expect(restored.value.gamepad?.buttons).toHaveLength(2)
    expect(gamepadConflicts(restored.value.gamepad!)).toEqual([
      { device: 'button', index: 0, actions: ['jump', 'attack'] },
    ])
  })
})

