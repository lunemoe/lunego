import type {
  CueInstance,
  FrameEvent,
  ModelPatch,
  QueryDef,
  SendOptions,
} from '@lunego/core'
import { createSignal, type Accessor } from 'solid-js'

export interface UiFrame {
  readonly tick: number
  readonly events: readonly FrameEvent[]
  readonly cues: readonly CueInstance[]
  readonly modelPatches: readonly ModelPatch[]
  readonly models: Readonly<Record<string, unknown>>
}

export interface UiGame {
  readonly frame: UiFrame
  send(type: string, payload: unknown, options?: SendOptions): Promise<unknown>
  query<Args, Result>(query: QueryDef<Args, Result>, args: Args): Result
  subscribeFrames?(listener: (frame: UiFrame) => void): () => void
}

export interface UiBridge {
  readonly tick: Accessor<number>
  readonly frame: Accessor<UiFrame>
  readonly models: Accessor<Readonly<Record<string, unknown>>>
  send(type: string, payload: unknown, options?: SendOptions): Promise<unknown>
  query<Args, Result>(query: QueryDef<Args, Result>, args: Args): Result
  dispose(): void
}

/**
 * Read-only bridge from the host to Solid. UI never writes state: it reads the
 * latest frame and sends commands. If the host has no frame subscription, the
 * initial frame remains until the UI calls refresh; the host exposes
 * subscribeFrames for normal use.
 */
export function createUiBridge(game: UiGame): UiBridge {
  const [frame, setFrame] = createSignal<UiFrame>(game.frame)
  let disposed = false
  const unsubscribe = game.subscribeFrames?.((next) => {
    if (!disposed) {
      setFrame(next)
    }
  })
  return {
    tick: () => frame().tick,
    frame,
    models: () => frame().models,
    send: (type, payload, options) => game.send(type, payload, options),
    query: (query, args) => game.query(query, args),
    dispose: () => {
      if (disposed) {
        return
      }
      disposed = true
      unsubscribe?.()
    },
  }
}
