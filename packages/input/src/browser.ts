import type { Input } from './input.js'
import type { KeyEventLike, KeyboardTarget } from './input.js'
import type { PointerEventLike, PointerTarget } from './pointer.js'

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
  input.attachPointer(pointerTarget(resolved))
  return () => {
    input.detach()
    input.detachPointer()
  }
}

export type { KeyEventLike, KeyboardTarget, PointerEventLike, PointerTarget }
