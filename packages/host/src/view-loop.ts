import type { GameFrame } from './types.js'

export interface ViewLoopGame {
  update(deltaSeconds: number): number
  readonly frame: GameFrame
  readonly alpha: number
  readonly paused: boolean
  pause(): void
  resume(): void
}

export interface ViewLoopScheduler {
  request(callback: (now: number) => void): number
  cancel(id: number): void
  now(): number
}

export interface ViewLoopVisibility {
  hidden(): boolean
  addEventListener(listener: () => void): void
  removeEventListener(listener: () => void): void
}

export interface ViewLoopFrame {
  readonly game: ViewLoopGame
  readonly frame: GameFrame
  /** Wall-clock seconds since the loop started. */
  readonly elapsed: number
  /** Seconds advanced by this animation frame, clamped. */
  readonly dt: number
  readonly alpha: number
}

export interface ViewLoopOptions {
  readonly game: ViewLoopGame
  readonly update: (view: ViewLoopFrame) => void
  readonly scheduler?: ViewLoopScheduler
  readonly visibility?: ViewLoopVisibility
  readonly maxDeltaSeconds?: number
}

export interface ViewLoop {
  readonly running: boolean
  stop(): void
}

interface GlobalScheduler {
  readonly requestAnimationFrame?: (callback: (now: number) => void) => number
  readonly cancelAnimationFrame?: (id: number) => void
  readonly performance?: { now(): number }
}

interface GlobalVisibility {
  readonly document?: {
    readonly hidden: boolean
    addEventListener(type: 'visibilitychange', listener: () => void): void
    removeEventListener(type: 'visibilitychange', listener: () => void): void
  }
}

export function createViewLoop(options: ViewLoopOptions): ViewLoop {
  const global = globalThis as GlobalScheduler
  const scheduler: ViewLoopScheduler = options.scheduler ?? {
    request: (callback) => {
      if (global.requestAnimationFrame === undefined) {
        throw new Error('requestAnimationFrame is unavailable; inject a scheduler')
      }
      return global.requestAnimationFrame(callback)
    },
    cancel: (id) => {
      global.cancelAnimationFrame?.(id)
    },
    now: () => global.performance?.now() ?? Date.now(),
  }
  const globalVisibility = globalThis as GlobalVisibility
  const visibility: ViewLoopVisibility | undefined = options.visibility ?? (
    globalVisibility.document === undefined
      ? undefined
      : {
          hidden: () => globalVisibility.document?.hidden ?? false,
          addEventListener: (listener) =>
            globalVisibility.document?.addEventListener('visibilitychange', listener),
          removeEventListener: (listener) =>
            globalVisibility.document?.removeEventListener('visibilitychange', listener),
        }
  )
  const maxDelta = options.maxDeltaSeconds ?? 0.1
  const start = scheduler.now()
  let last = start
  let handle = 0
  let running = true
  let pausedByVisibility = false
  let userPaused = options.game.paused

  const onVisibility = (): void => {
    if (visibility?.hidden() === true) {
      if (!pausedByVisibility) {
        pausedByVisibility = true
        userPaused = options.game.paused
        options.game.pause()
      }
    } else if (pausedByVisibility) {
      pausedByVisibility = false
      if (!userPaused) {
        options.game.resume()
      }
    }
  }
  visibility?.addEventListener(onVisibility)

  const tick = (now: number): void => {
    if (!running) {
      return
    }
    const delta = Math.max(0, Math.min(maxDelta, (now - last) / 1000))
    last = now
    if (!pausedByVisibility) {
      options.game.update(delta)
    }
    options.update({
      game: options.game,
      frame: options.game.frame,
      elapsed: (now - start) / 1000,
      dt: delta,
      alpha: options.game.alpha,
    })
    handle = scheduler.request(tick)
  }

  handle = scheduler.request(tick)

  return {
    get running() {
      return running
    },
    stop: () => {
      if (!running) {
        return
      }
      running = false
      scheduler.cancel(handle)
      visibility?.removeEventListener(onVisibility)
    },
  }
}

export const startViewLoop = createViewLoop
