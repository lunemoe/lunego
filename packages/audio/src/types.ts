import type { CueInstance } from '@lunego/core'

export type AudioBusName = 'master' | 'sfx' | 'music' | 'ui'

export interface AudioParamLike {
  value: number
  setValueAtTime(value: number, time: number): void
  linearRampToValueAtTime(value: number, time: number): void
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): void
  disconnect(): void
}

export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike
}

export interface AudioBufferLike {
  readonly duration: number
}

export interface BufferSourceLike extends AudioNodeLike {
  buffer: AudioBufferLike | null
  readonly playbackRate: AudioParamLike
  loop: boolean
  start(when?: number): void
  stop(when?: number): void
  onended: (() => void) | null
}

export interface AudioContextLike {
  readonly currentTime: number
  readonly state: 'suspended' | 'running' | 'closed' | 'interrupted'
  readonly destination: AudioNodeLike
  createGain(): GainNodeLike
  createBufferSource(): BufferSourceLike
  resume(): Promise<void>
  close(): Promise<void>
}

export interface SoundLoader {
  load(source: string | ArrayBuffer): Promise<AudioBufferLike>
}

export interface LoadedSound {
  readonly id: string
  readonly buffer: AudioBufferLike
}

export interface SoundLoadReport {
  readonly loaded: readonly string[]
  readonly failed: ReadonlyArray<{ readonly id: string; readonly error: unknown }>
}

export interface AudioRequest {
  readonly sound: string
  readonly bus?: AudioBusName
  readonly volume?: number
  readonly pitch?: number
  readonly pitchJitter?: number
  readonly volumeJitter?: number
  readonly maxConcurrent?: number
  /** Loop on the music/ambient bus (buffer source loop). */
  readonly loop?: boolean
}

export type AudioCueResolver = (cue: CueInstance) => readonly AudioRequest[]

export interface VoiceHandle {
  readonly id: number
  readonly sound: string
  readonly bus: AudioBusName
  setVolume(value: number): void
  fadeTo(value: number, seconds: number): void
  onEnded(listener: () => void): () => void
  stop(when?: number): void
}

export interface AudioSystemOptions {
  readonly buses?: Partial<Record<AudioBusName, number>>
  readonly maxConcurrent?: number
  readonly seed?: number
  readonly ownsContext?: boolean
  readonly onError?: (error: unknown) => void
}
