import type { CueInstance, Frame } from '@lunego/core'
import type { SoundBank } from './sounds.js'
import type {
  AudioBusName,
  AudioContextLike,
  AudioCueResolver,
  AudioNodeLike,
  AudioRequest,
  AudioSystemOptions,
  BufferSourceLike,
  GainNodeLike,
  VoiceHandle,
} from './types.js'

interface BusNodes {
  readonly gain: GainNodeLike
  volume: number
  muted: boolean
}

interface Voice extends VoiceHandle {
  readonly source: BufferSourceLike
  readonly gain: GainNodeLike
  readonly ended: Set<() => void>
}

function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

function jitter(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export class AudioCueMap {
  private readonly rules = new Map<string, AudioCueResolver>()

  add(name: string, resolve: AudioCueResolver): this {
    if (this.rules.has(name)) {
      throw new Error(`cue ${name} already has an audio mapping`)
    }
    this.rules.set(name, resolve)
    return this
  }

  resolve(cue: CueInstance): readonly AudioRequest[] {
    return this.rules.get(cue.type)?.(cue) ?? []
  }
}

export function defineAudioCueMap(
  rules: Readonly<Record<string, AudioCueResolver>>,
): AudioCueMap {
  const map = new AudioCueMap()
  for (const name of Object.keys(rules)) {
    map.add(name, rules[name])
  }
  return map
}

/**
 * Web Audio mixer and cue player. Sounds are view assets; the logic layer
 * never imports this package. Jitter comes from a seeded generator so a
 * replay/cue log produces the same mix.
 */
export class AudioSystem {
  private readonly context: AudioContextLike
  private readonly sounds: SoundBank
  private readonly ownsContext: boolean
  private readonly onError: ((error: unknown) => void) | undefined
  private readonly master: GainNodeLike
  private readonly buses: Record<AudioBusName, BusNodes>
  private readonly maxConcurrent: number
  private readonly seed: number
  private readonly active = new Map<number, Voice>()
  private readonly bySound = new Map<string, Voice[]>()
  private nextId = 1
  private nextSeed = 1
  private lastFrameTick = -1
  private destroyed = false

  constructor(context: AudioContextLike, sounds: SoundBank, options: AudioSystemOptions = {}) {
    this.context = context
    this.sounds = sounds
    this.ownsContext = options.ownsContext ?? false
    this.onError = options.onError
    this.maxConcurrent = options.maxConcurrent ?? 8
    if (!Number.isInteger(this.maxConcurrent) || this.maxConcurrent < 1) {
      throw new Error('audio concurrency limit must be a positive integer')
    }
    this.seed = options.seed ?? 1
    this.master = context.createGain()
    this.master.connect(context.destination)
    const volumeFor = options.buses ?? {}
    const makeBus = (name: AudioBusName): BusNodes => {
      const gain = context.createGain()
      gain.connect(this.master)
      const volume = volumeFor[name] ?? 1
      gain.gain.value = volume
      return { gain, volume, muted: false }
    }
    this.buses = {
      master: { gain: this.master, volume: 1, muted: false },
      sfx: makeBus('sfx'),
      music: makeBus('music'),
      ui: makeBus('ui'),
    }
  }

  get currentTime(): number {
    return this.context.currentTime
  }

  get activeVoices(): readonly VoiceHandle[] {
    return [...this.active.values()]
  }

  get voiceCount(): number {
    return this.active.size
  }

  setVolume(bus: AudioBusName, volume: number): void {
    if (!Number.isFinite(volume) || volume < 0) {
      throw new Error('volume must be a non-negative finite number')
    }
    const node = this.buses[bus]
    node.volume = volume
    node.gain.gain.value = node.muted ? 0 : volume
  }

  getVolume(bus: AudioBusName): number {
    return this.buses[bus].volume
  }

  setMuted(bus: AudioBusName, muted: boolean): void {
    const node = this.buses[bus]
    node.muted = muted
    node.gain.gain.value = muted ? 0 : node.volume
  }

  isMuted(bus: AudioBusName): boolean {
    return this.buses[bus].muted
  }

  async unlock(): Promise<void> {
    if (this.destroyed || this.context.state === 'running') {
      return
    }
    try {
      await this.context.resume()
    } catch (error) {
      this.onError?.(error)
    }
  }

  play(request: AudioRequest, seedKey?: string): VoiceHandle | null {
    if (this.destroyed) {
      return null
    }
    const sound = this.sounds.get(request.sound)
    if (sound === undefined) {
      return null
    }
    const seed = hashString(seedKey ?? `auto:${this.nextSeed}`)
    if (seedKey === undefined) {
      this.nextSeed += 1
    }
    const random = jitter(seed ^ this.seed)
    const pitchJitter = request.pitchJitter ?? 0
    const volumeJitter = request.volumeJitter ?? 0
    const pitch = (request.pitch ?? 1) * (1 + pitchJitter * (random() * 2 - 1))
    const volume = Math.max(
      0,
      (request.volume ?? 1) * (1 + volumeJitter * (random() * 2 - 1)),
    )
    const busName = request.bus ?? 'sfx'
    const limit = request.maxConcurrent ?? this.maxConcurrent
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error('audio concurrency limit must be a positive integer')
    }
    const playing = this.bySound.get(request.sound) ?? []
    if (playing.length >= limit) {
      const oldest = playing[0]
      if (oldest !== undefined) {
        this.stopVoice(oldest)
      }
    }
    const source = this.context.createBufferSource()
    source.buffer = sound.buffer
    source.playbackRate.value = pitch
    source.loop = request.loop ?? false
    const gain = this.context.createGain()
    gain.gain.value = volume
    source.connect(gain)
    gain.connect(this.buses[busName].gain)
    const id = this.nextId
    this.nextId += 1
    const voice: Voice = {
      id,
      sound: request.sound,
      bus: busName,
      source,
      gain,
      ended: new Set(),
      setVolume: (value: number) => {
        gain.gain.value = Math.max(0, value)
      },
      fadeTo: (value: number, seconds: number) => {
        const now = this.context.currentTime
        gain.gain.setValueAtTime(gain.gain.value, now)
        gain.gain.linearRampToValueAtTime(Math.max(0, value), now + Math.max(0, seconds))
      },
      onEnded: (listener: () => void) => {
        voice.ended.add(listener)
        return () => voice.ended.delete(listener)
      },
      stop: (when?: number) => {
        source.stop(when)
      },
    }
    source.onended = () => {
      this.release(voice)
    }
    this.active.set(id, voice)
    const bucket = this.bySound.get(request.sound)
    if (bucket === undefined) {
      this.bySound.set(request.sound, [voice])
    } else {
      bucket.push(voice)
    }
    source.start()
    return voice
  }

  consume(frame: Frame, map: AudioCueMap): void {
    if (frame.tick === this.lastFrameTick) {
      return
    }
    this.lastFrameTick = frame.tick
    for (const cue of frame.cues) {
      const requests = map.resolve(cue)
      for (let index = 0; index < requests.length; index += 1) {
        this.play(requests[index], `${cue.id}:${index}`)
      }
    }
  }

  stopAll(): void {
    for (const voice of [...this.active.values()]) {
      this.stopVoice(voice)
    }
    this.active.clear()
    this.bySound.clear()
  }

  destroy(): void {
    if (this.destroyed) {
      return
    }
    this.stopAll()
    this.lastFrameTick = -1
    for (const bus of Object.values(this.buses)) {
      bus.gain.disconnect()
    }
    this.destroyed = true
    if (this.ownsContext) {
      void this.context.close()
    }
  }

  private stopVoice(voice: Voice): void {
    try {
      voice.source.stop()
    } catch (error) {
      this.onError?.(error)
    }
    this.release(voice)
  }

  private release(voice: Voice): void {
    if (!this.active.delete(voice.id)) {
      return
    }
    const bucket = this.bySound.get(voice.sound)
    if (bucket !== undefined) {
      const index = bucket.indexOf(voice)
      if (index >= 0) {
        bucket.splice(index, 1)
      }
      if (bucket.length === 0) {
        this.bySound.delete(voice.sound)
      }
    }
    voice.gain.disconnect()
    for (const listener of voice.ended) {
      listener()
    }
    voice.ended.clear()
  }
}

export interface UnlockTarget {
  addEventListener(type: 'pointerdown' | 'keydown', listener: () => void): void
  removeEventListener(type: 'pointerdown' | 'keydown', listener: () => void): void
}

/** Resume audio on the first user gesture, then detach. */
export function attachAudioUnlock(audio: AudioSystem, target: UnlockTarget): () => void {
  const handler = (): void => {
    void audio.unlock()
    detach()
  }
  const detach = (): void => {
    target.removeEventListener('pointerdown', handler)
    target.removeEventListener('keydown', handler)
  }
  target.addEventListener('pointerdown', handler)
  target.addEventListener('keydown', handler)
  return detach
}

export type { AudioNodeLike }

interface BrowserUnlockGlobal {
  readonly addEventListener?: (type: 'pointerdown' | 'keydown', listener: () => void) => void
  readonly removeEventListener?: (type: 'pointerdown' | 'keydown', listener: () => void) => void
}

/** Attach the first-gesture unlock to the browser window without DOM in games. */
export function attachBrowserAudioUnlock(audio: AudioSystem): () => void {
  const global = globalThis as BrowserUnlockGlobal
  const target: UnlockTarget = {
    addEventListener: (type, listener) => {
      if (global.addEventListener === undefined) {
        throw new Error('browser audio target is unavailable')
      }
      global.addEventListener(type, listener)
    },
    removeEventListener: (type, listener) => {
      global.removeEventListener?.(type, listener)
    },
  }
  return attachAudioUnlock(audio, target)
}
