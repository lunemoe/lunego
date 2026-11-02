import type { AudioSystem } from './system.js'
import type { VoiceHandle } from './types.js'

export interface MusicOptions {
  readonly fadeSeconds?: number
  readonly volume?: number
}

/** Single-source music bus controller: one looping buffer voice at a time. */
export class MusicController {
  private readonly audio: AudioSystem
  private readonly fadeSeconds: number
  private currentVoice: VoiceHandle | null = null
  private volumeValue: number
  private mutedValue = false
  private removeEnded: (() => void) | null = null

  constructor(audio: AudioSystem, options: MusicOptions = {}) {
    this.audio = audio
    this.fadeSeconds = options.fadeSeconds ?? 0.4
    this.volumeValue = options.volume ?? 0.35
    audio.setVolume('music', this.volumeValue)
  }

  get current(): string | null {
    return this.currentVoice?.sound ?? null
  }

  get playing(): boolean {
    return this.currentVoice !== null
  }

  get volume(): number {
    return this.volumeValue
  }

  get muted(): boolean {
    return this.mutedValue
  }

  play(sound: string, options: MusicOptions = {}): boolean {
    this.stop(0)
    const voice = this.audio.play(
      { sound, bus: 'music', loop: true, volume: 1 },
      `music:${sound}`,
    )
    if (voice === null) {
      return false
    }
    if (options.volume !== undefined) {
      this.setVolume(options.volume)
    }
    const fade = options.fadeSeconds ?? this.fadeSeconds
    voice.setVolume(0)
    voice.fadeTo(1, fade)
    this.currentVoice = voice
    this.removeEnded = voice.onEnded(() => {
      if (this.currentVoice === voice) {
        this.currentVoice = null
        this.removeEnded = null
      }
    })
    return true
  }

  stop(fadeSeconds = this.fadeSeconds): void {
    const voice = this.currentVoice
    if (voice === null) {
      return
    }
    this.currentVoice = null
    this.removeEnded?.()
    this.removeEnded = null
    if (fadeSeconds <= 0) {
      voice.stop()
      return
    }
    voice.fadeTo(0, fadeSeconds)
    voice.stop(this.audio.currentTime + fadeSeconds)
  }

  setVolume(volume: number): void {
    if (!Number.isFinite(volume) || volume < 0) {
      throw new Error('music volume must be non-negative')
    }
    this.volumeValue = volume
    this.audio.setVolume('music', volume)
  }

  setMuted(muted: boolean): void {
    this.mutedValue = muted
    this.audio.setMuted('music', muted)
  }

  destroy(): void {
    this.stop(0)
  }
}
