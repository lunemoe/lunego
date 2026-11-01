import type { ModelPatch } from './model.js'

export type CommandSource = number | string

export interface CommandEnvelope {
  readonly tick: number
  readonly seq: number
  readonly source: CommandSource
  readonly type: string
  readonly payload: unknown
}

export interface SendOptions {
  readonly source?: CommandSource
  readonly tick?: number
}

export interface FrameEvent {
  readonly type: string
  readonly tick: number
  readonly payload: unknown
}

export interface CueInstance {
  readonly id: string
  readonly type: string
  readonly tick: number
  readonly sequence: number
  readonly source: string
  readonly payload: unknown
}

export interface Frame {
  readonly tick: number
  readonly events: readonly FrameEvent[]
  readonly cues: readonly CueInstance[]
  readonly modelPatches: readonly ModelPatch[]
}

export function emptyFrame(tick: number): Frame {
  return { tick, events: [], cues: [], modelPatches: [] }
}
