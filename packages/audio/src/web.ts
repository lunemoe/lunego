import { SoundBank } from './sounds.js'
import { AudioSystem } from './system.js'
import type {
  AudioContextLike,
  AudioNodeLike,
  AudioSystemOptions,
  BufferSourceLike,
  GainNodeLike,
  SoundLoader,
} from './types.js'

export class WebSoundLoader implements SoundLoader {
  private readonly context: AudioContext

  constructor(context: AudioContext) {
    this.context = context
  }

  async load(source: string | ArrayBuffer): Promise<AudioBuffer> {
    const data = typeof source === 'string'
      ? await (await fetch(source)).arrayBuffer()
      : source
    return await this.context.decodeAudioData(data)
  }
}

function wrapNode(node: AudioNode): AudioNodeLike {
  return {
    connect: (destination) => {
      node.connect(destination as AudioNode)
    },
    disconnect: () => {
      node.disconnect()
    },
  }
}

function wrapGain(node: GainNode): GainNodeLike {
  return { ...wrapNode(node), gain: node.gain }
}

function wrapSource(node: AudioBufferSourceNode): BufferSourceLike {
  let ended: (() => void) | null = null
  return {
    ...wrapNode(node),
    get buffer() {
      return node.buffer
    },
    set buffer(buffer) {
      node.buffer = buffer as AudioBuffer | null
    },
    playbackRate: node.playbackRate,
    start: (when) => {
      node.start(when)
    },
    stop: (when) => {
      node.stop(when)
    },
    get onended() {
      return ended
    },
    set onended(handler) {
      ended = handler
      node.onended = handler === null ? null : () => handler()
    },
  }
}

function wrapContext(context: AudioContext): AudioContextLike {
  return {
    get currentTime() {
      return context.currentTime
    },
    get state() {
      return context.state
    },
    get destination() {
      return wrapNode(context.destination)
    },
    createGain: () => wrapGain(context.createGain()),
    createBufferSource: () => wrapSource(context.createBufferSource()),
    resume: () => context.resume(),
    close: () => context.close(),
  }
}

export interface WebAudioOptions extends AudioSystemOptions {
  readonly context?: AudioContext
}

export interface WebAudio {
  readonly context: AudioContext
  readonly sounds: SoundBank
  readonly audio: AudioSystem
}

/** Browser entry: owns its AudioContext and decodes fetch()/ArrayBuffer assets. */
export function createWebAudio(options: WebAudioOptions = {}): WebAudio {
  const context = options.context ?? new AudioContext()
  const sounds = new SoundBank(new WebSoundLoader(context))
  const audio = new AudioSystem(wrapContext(context), sounds, {
    ...options,
    ownsContext: options.ownsContext ?? options.context === undefined,
  })
  return { context, sounds, audio }
}
