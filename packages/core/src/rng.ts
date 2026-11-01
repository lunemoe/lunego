import { LuneGoError } from './errors.js'

export interface RngStream {
  /** Uniform float in [0, 1). */
  next(): number
  uint32(): number
  int(minInclusive: number, maxInclusive: number): number
  float(min: number, max: number): number
  chance(probability: number): boolean
  pick<T>(items: readonly T[]): T
}

export type RngStateWords = readonly [number, number, number, number]

function mix32(value: number): number {
  let z = (value + 0x9e3779b9) >>> 0
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0
  return (z ^ (z >>> 15)) >>> 0
}

function hashName(name: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

function deriveState(seed: number, name: string): [number, number, number, number] {
  let state = (seed ^ hashName(name)) >>> 0
  const a = mix32(state)
  state = (state + 0x9e3779b9) >>> 0
  const b = mix32(state)
  state = (state + 0x9e3779b9) >>> 0
  const c = mix32(state)
  state = (state + 0x9e3779b9) >>> 0
  const d = mix32(state)
  if ((a | b | c | d) === 0) {
    return [1, 1, 1, 1]
  }
  return [a, b, c, d]
}

class RngStreamImpl implements RngStream {
  private a: number
  private b: number
  private c: number
  private d: number

  constructor(state: RngStateWords) {
    this.a = state[0] >>> 0
    this.b = state[1] >>> 0
    this.c = state[2] >>> 0
    this.d = state[3] >>> 0
    if ((this.a | this.b | this.c | this.d) === 0) {
      throw new LuneGoError('rng_invalid', 'RNG state must not be all zero')
    }
  }

  uint32(): number {
    let t = (this.a + this.b) >>> 0
    t = (t + this.d) >>> 0
    this.d = (this.d + 1) >>> 0
    this.a = (this.b ^ (this.b >>> 9)) >>> 0
    this.b = (this.c + (this.c << 3)) >>> 0
    this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0
    this.c = (this.c + t) >>> 0
    return t
  }

  next(): number {
    return this.uint32() / 4294967296
  }

  int(minInclusive: number, maxInclusive: number): number {
    if (!Number.isSafeInteger(minInclusive) || !Number.isSafeInteger(maxInclusive)) {
      throw new LuneGoError('rng_invalid', 'int bounds must be safe integers')
    }
    if (maxInclusive < minInclusive) {
      throw new LuneGoError('rng_invalid', 'int bounds are reversed')
    }
    const span = maxInclusive - minInclusive + 1
    if (span > 4294967296) {
      throw new LuneGoError('rng_invalid', 'int range must fit in 32 bits')
    }
    const limit = Math.floor(4294967296 / span) * span
    let value = this.uint32()
    while (value >= limit) {
      value = this.uint32()
    }
    return minInclusive + (value % span)
  }

  float(min: number, max: number): number {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
      throw new LuneGoError('rng_invalid', 'float bounds must be finite and ordered')
    }
    return min + this.next() * (max - min)
  }

  chance(probability: number): boolean {
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new LuneGoError('rng_invalid', 'chance probability must be within [0, 1]')
    }
    if (probability === 0) {
      return false
    }
    if (probability === 1) {
      return true
    }
    return this.next() < probability
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new LuneGoError('rng_invalid', 'pick requires a non-empty array')
    }
    return items[this.int(0, items.length - 1)]
  }

  state(): RngStateWords {
    return [this.a, this.b, this.c, this.d]
  }
}

/**
 * Named RNG streams. The seed plus the stream name fully determine a stream;
 * consuming one stream never affects another.
 */
export class RngRegistry {
  readonly seed: number
  private readonly streams = new Map<string, RngStreamImpl>()

  constructor(seed: number) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) {
      throw new LuneGoError('rng_invalid', 'seed must be a uint32')
    }
    this.seed = seed >>> 0
  }

  rng(name: string): RngStream {
    if (name.length === 0) {
      throw new LuneGoError('rng_invalid', 'RNG stream name must not be empty')
    }
    const existing = this.streams.get(name)
    if (existing !== undefined) {
      return existing
    }
    const stream = new RngStreamImpl(deriveState(this.seed, name))
    this.streams.set(name, stream)
    return stream
  }

  states(): Readonly<Record<string, RngStateWords>> {
    const result: Record<string, RngStateWords> = {}
    for (const [name, stream] of this.streams) {
      result[name] = stream.state()
    }
    return result
  }

  streamNames(): readonly string[] {
    return [...this.streams.keys()]
  }

  stateOf(name: string): RngStateWords | undefined {
    return this.streams.get(name)?.state()
  }

  restore(seed: number, states: Readonly<Record<string, readonly number[]>>): void {
    if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) {
      throw new LuneGoError('snapshot_invalid', 'snapshot RNG seed must be a uint32')
    }
    const registry = new RngRegistry(seed)
    for (const name of Object.keys(states)) {
      const words = states[name]
      if (
        !Array.isArray(words) ||
        words.length !== 4 ||
        words.some((word) => !Number.isInteger(word) || word < 0 || word > 4294967295)
      ) {
        throw new LuneGoError('snapshot_invalid', `invalid RNG state for stream ${name}`)
      }
      registry.streams.set(name, new RngStreamImpl([words[0], words[1], words[2], words[3]]))
    }
    this.streams.clear()
    for (const [name, stream] of registry.streams) {
      this.streams.set(name, stream)
    }
  }
}
