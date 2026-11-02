import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CueInstance, Frame } from '@lunego/core'
import {
  AudioSystem,
  SoundBank,
  attachAudioUnlock,
  defineAudioCueMap,
  type AudioBufferLike,
  type AudioContextLike,
  type AudioNodeLike,
  type AudioParamLike,
  type BufferSourceLike,
  type GainNodeLike,
  type SoundLoader,
  type UnlockTarget,
} from '../index.js'

class Param implements AudioParamLike {
  value = 1
  setValueAtTime(value: number): void {
    this.value = value
  }
  linearRampToValueAtTime(value: number): void {
    this.value = value
  }
}

class Node implements AudioNodeLike {
  readonly targets: AudioNodeLike[] = []
  connect(destination: AudioNodeLike): void {
    this.targets.push(destination)
  }
  disconnect(): void {
    this.targets.length = 0
  }
}

class Gain extends Node implements GainNodeLike {
  readonly gain = new Param()
}

class Source extends Node implements BufferSourceLike {
  buffer: AudioBufferLike | null = null
  readonly playbackRate = new Param()
  started = false
  stopped = false
  onended: (() => void) | null = null
  start(): void {
    this.started = true
  }
  stop(): void {
    this.stopped = true
    this.onended?.()
  }
}

class Context implements AudioContextLike {
  currentTime = 0
  state: 'suspended' | 'running' | 'closed' = 'suspended'
  readonly destination = new Node()
  readonly gains: Gain[] = []
  readonly sources: Source[] = []
  resumes = 0
  closes = 0

  createGain(): GainNodeLike {
    const gain = new Gain()
    this.gains.push(gain)
    return gain
  }

  createBufferSource(): BufferSourceLike {
    const source = new Source()
    this.sources.push(source)
    return source
  }

  async resume(): Promise<void> {
    this.resumes += 1
    this.state = 'running'
  }

  async close(): Promise<void> {
    this.closes += 1
    this.state = 'closed'
  }
}

class FakeLoader implements SoundLoader {
  readonly failures = new Set<string>()
  async load(source: string | ArrayBuffer): Promise<AudioBufferLike> {
    if (typeof source === 'string' && this.failures.has(source)) {
      throw new Error(`cannot load ${source}`)
    }
    return { duration: 0.5 }
  }
}

function bankWith(id = 'hit'): SoundBank {
  const bank = new SoundBank(new FakeLoader())
  bank.register(id, { duration: 0.5 })
  return bank
}

function cue(id: string, type: string): CueInstance {
  return { id, type, tick: 1, sequence: 0, source: 'test', payload: undefined }
}

function frame(tick: number, ...cues: CueInstance[]): Frame {
  return { tick, events: [], cues, modelPatches: [] }
}

describe('audio buses', () => {
  it('routes buses through master and applies volume/mute', () => {
    const context = new Context()
    const audio = new AudioSystem(context, bankWith(), { buses: { sfx: 0.5 } })
    const master = context.gains[0]
    expect(master?.targets).toContain(context.destination)
    const sfx = context.gains[1]
    expect(sfx?.targets).toContain(master)
    expect(audio.getVolume('sfx')).toBe(0.5)
    audio.setVolume('sfx', 0.25)
    expect(sfx?.gain.value).toBe(0.25)
    audio.setMuted('sfx', true)
    expect(sfx?.gain.value).toBe(0)
    audio.setMuted('sfx', false)
    expect(sfx?.gain.value).toBe(0.25)
    expect(() => audio.setVolume('sfx', -1)).toThrow(/volume/)
  })

  it('adds deterministic pitch and volume jitter per cue seed', () => {
    const sounds = bankWith()
    const leftContext = new Context()
    const rightContext = new Context()
    const left = new AudioSystem(leftContext, sounds, { seed: 9 })
    const right = new AudioSystem(rightContext, sounds, { seed: 9 })
    left.play({ sound: 'hit', pitch: 1, pitchJitter: 0.2, volumeJitter: 0.3 }, 'cue:0')
    right.play({ sound: 'hit', pitch: 1, pitchJitter: 0.2, volumeJitter: 0.3 }, 'cue:0')
    expect(leftContext.sources[0]?.playbackRate.value).toBe(
      rightContext.sources[0]?.playbackRate.value,
    )
    expect(leftContext.sources[0]?.playbackRate.value).not.toBe(1)
    expect(leftContext.sources[0]?.targets[0]).toBeDefined()
  })

  it('caps concurrent voices per sound by stopping the oldest', () => {
    const context = new Context()
    const audio = new AudioSystem(context, bankWith())
    audio.play({ sound: 'hit', maxConcurrent: 2 })
    audio.play({ sound: 'hit', maxConcurrent: 2 })
    audio.play({ sound: 'hit', maxConcurrent: 2 })
    expect(context.sources).toHaveLength(3)
    expect(context.sources[0]?.stopped).toBe(true)
    expect(audio.voiceCount).toBe(2)
  })

  it('plays cues once per tick through a cue map', () => {
    const context = new Context()
    const audio = new AudioSystem(context, bankWith())
    const map = defineAudioCueMap({
      'test.hit': () => [{ sound: 'hit', pitchJitter: 0.1 }],
    })
    audio.consume(frame(1, cue('1:test:0', 'test.hit')), map)
    audio.consume(frame(1, cue('1:test:0', 'test.hit')), map)
    expect(audio.voiceCount).toBe(1)
    audio.consume(frame(2, cue('2:test:0', 'test.hit')), map)
    expect(audio.voiceCount).toBe(2)
  })

  it('rejects non-positive concurrency limits', () => {
    const context = new Context()
    const audio = new AudioSystem(context, bankWith())
    expect(() => audio.play({ sound: 'hit', maxConcurrent: 0 })).toThrow(/concurrency/)
    expect(() => new AudioSystem(context, bankWith(), { maxConcurrent: 0 })).toThrow(/concurrency/)
  })

  it('accepts a rewound frame tick and can stop all voices on reload', () => {
    const context = new Context()
    const audio = new AudioSystem(context, bankWith())
    const map = defineAudioCueMap({ 'test.hit': () => [{ sound: 'hit' }] })
    audio.consume(frame(10, cue('10:test:0', 'test.hit')), map)
    expect(audio.voiceCount).toBe(1)
    audio.consume(frame(3, cue('3:test:0', 'test.hit')), map)
    expect(audio.voiceCount).toBe(2)
    audio.stopAll()
    expect(audio.voiceCount).toBe(0)
    expect(context.sources.every((source) => source.stopped)).toBe(true)
  })

  it('unlocks on the first gesture and detaches', async () => {
    const context = new Context()
    const audio = new AudioSystem(context, bankWith())
    const listeners = new Map<string, Array<() => void>>()
    const target: UnlockTarget = {
      addEventListener: (type, listener) => {
        const list = listeners.get(type) ?? []
        list.push(listener)
        listeners.set(type, list)
      },
      removeEventListener: (type, listener) => {
        listeners.set(type, (listeners.get(type) ?? []).filter((item) => item !== listener))
      },
    }
    attachAudioUnlock(audio, target)
    expect(listeners.get('pointerdown')).toHaveLength(1)
    for (const listener of listeners.get('pointerdown') ?? []) {
      listener()
    }
    await Promise.resolve()
    expect(context.resumes).toBe(1)
    expect(context.state).toBe('running')
    expect(listeners.get('pointerdown')).toHaveLength(0)
  })
})

describe('sound bank', () => {
  it('loads manifests with failure isolation', async () => {
    const loader = new FakeLoader()
    loader.failures.add('bad.ogg')
    const bank = new SoundBank(loader)
    const report = await bank.loadManifest({
      hit: { source: 'hit.ogg' },
      bad: { source: 'bad.ogg' },
      music: { source: 'music.ogg' },
    })
    expect(report.loaded).toEqual(['hit', 'music'])
    expect(report.failed.map((entry) => entry.id)).toEqual(['bad'])
    expect(bank.has('hit')).toBe(true)
    expect(bank.failure('bad')).toBeInstanceOf(Error)
    bank.destroy()
    expect(bank.size).toBe(0)
  })

  it('does not use Math.random', () => {
    const source = readFileSync(new URL('../system.ts', import.meta.url), 'utf8')
    expect(source.includes('Math.random')).toBe(false)
  })
})


describe('sound bank concurrency and lifecycle', () => {
  it('deduplicates concurrent loads and rejects an in-flight load after destroy', async () => {
    let resolveLoad: ((buffer: AudioBufferLike) => void) | null = null
    const loader: SoundLoader = {
      load: () => new Promise((resolve) => { resolveLoad = resolve }),
    }
    const bank = new SoundBank(loader)
    const first = bank.load('hit', 'hit.ogg')
    const second = bank.load('hit', 'hit.ogg')
    expect(first).toBe(second)
    resolveLoad?.({ duration: 0.5 })
    const [a, b] = await Promise.all([first, second])
    expect(a.buffer.duration).toBe(0.5)
    expect(b.id).toBe('hit')
    expect(bank.size).toBe(1)

    const slow = bank.load('late', 'late.ogg')
    bank.destroy()
    resolveLoad?.({ duration: 0.5 })
    await expect(slow).rejects.toThrow(/destroyed/)
    expect(bank.has('late')).toBe(false)
  })

  it('clears a failure when the sound is registered', async () => {
    const loader = new FakeLoader()
    loader.failures.add('bad.ogg')
    const bank = new SoundBank(loader)
    await expect(bank.load('bad', 'bad.ogg')).rejects.toThrow(/cannot load/)
    expect(bank.failure('bad')).toBeInstanceOf(Error)
    bank.register('bad', { duration: 1 })
    expect(bank.failure('bad')).toBeUndefined()
    expect(bank.has('bad')).toBe(true)
  })
})
