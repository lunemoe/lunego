import type { Input } from './input.js'
import type { KeyEventLike, KeyboardTarget } from './input.js'
import type { PointerEventLike, PointerTarget } from './pointer.js'
import type { GamepadLike, GamepadSource } from './gamepad.js'

export interface BrowserInputTarget {
  addEventListener(type: string, listener: (event: never) => void): void
  removeEventListener(type: string, listener: (event: never) => void): void
}

interface GlobalTarget {
  readonly addEventListener?: BrowserInputTarget['addEventListener']
  readonly removeEventListener?: BrowserInputTarget['removeEventListener']
}

function keyboardTarget(target: BrowserInputTarget): KeyboardTarget {
  return {
    addEventListener: (type, listener) => {
      target.addEventListener(type, listener as (event: never) => void)
    },
    removeEventListener: (type, listener) => {
      target.removeEventListener(type, listener as (event: never) => void)
    },
  }
}

function pointerTarget(target: BrowserInputTarget): PointerTarget {
  return {
    addEventListener: (type, listener) => {
      target.addEventListener(type, listener as (event: never) => void)
    },
    removeEventListener: (type, listener) => {
      target.removeEventListener(type, listener as (event: never) => void)
    },
  }
}

/** Attach keyboard + pointer to the browser window; keep DOM out of games. */
export function attachBrowserInput(
  input: Input,
  target?: BrowserInputTarget,
  pointerSurface?: PointerTarget,
): () => void {
  const global = globalThis as GlobalTarget
  const resolved: BrowserInputTarget = target ?? {
    addEventListener: (type, listener) => {
      if (global.addEventListener === undefined) {
        throw new Error('browser input target is unavailable; inject a BrowserInputTarget')
      }
      global.addEventListener(type, listener)
    },
    removeEventListener: (type, listener) => {
      global.removeEventListener?.(type, listener)
    },
  }
  input.attach(keyboardTarget(resolved))
  input.attachPointer(pointerSurface ?? pointerTarget(resolved))
  const onBlur = (): void => input.releaseAll()
  const onVisibility = (): void => {
    const doc = (globalThis as { readonly document?: { readonly hidden: boolean } }).document
    if (doc === undefined || doc.hidden) {
      input.releaseAll()
    }
  }
  resolved.addEventListener('blur', onBlur as (event: never) => void)
  resolved.addEventListener('visibilitychange', onVisibility as (event: never) => void)
  return () => {
    input.detach()
    input.detachPointer()
    resolved.removeEventListener('blur', onBlur as (event: never) => void)
    resolved.removeEventListener('visibilitychange', onVisibility as (event: never) => void)
  }
}

export interface GamepadBrowserTarget {
  addEventListener(
    type: 'gamepadconnected' | 'gamepaddisconnected',
    listener: (event: { readonly gamepad: GamepadLike }) => void,
  ): void
  removeEventListener(
    type: 'gamepadconnected' | 'gamepaddisconnected',
    listener: (event: { readonly gamepad: GamepadLike }) => void,
  ): void
}

interface GamepadGlobal {
  readonly addEventListener?: GamepadBrowserTarget['addEventListener']
  readonly removeEventListener?: GamepadBrowserTarget['removeEventListener']
}

/** Owns browser hotplug listeners; games never touch window/navigator directly. */
export function attachBrowserGamepad(
  source: GamepadSource,
  target?: GamepadBrowserTarget,
): () => void {
  const global = globalThis as GamepadGlobal
  const resolved: GamepadBrowserTarget = target ?? {
    addEventListener: (type, listener) => {
      if (global.addEventListener === undefined) {
        throw new Error('gamepad target is unavailable; inject a GamepadBrowserTarget')
      }
      global.addEventListener(type, listener)
    },
    removeEventListener: (type, listener) => {
      global.removeEventListener?.(type, listener)
    },
  }
  const onConnected = (event: { readonly gamepad: GamepadLike }): void => {
    source.setGamepad(event.gamepad)
  }
  const onDisconnected = (event: { readonly gamepad: GamepadLike }): void => {
    source.removeGamepad(event.gamepad.index)
  }
  resolved.addEventListener('gamepadconnected', onConnected)
  resolved.addEventListener('gamepaddisconnected', onDisconnected)
  return () => {
    resolved.removeEventListener('gamepadconnected', onConnected)
    resolved.removeEventListener('gamepaddisconnected', onDisconnected)
  }
}

export type { KeyEventLike, KeyboardTarget, PointerEventLike, PointerTarget }
