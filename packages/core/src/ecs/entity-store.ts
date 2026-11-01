import { LuneGoError } from '../errors.js'
import type { Entity } from '../schema.js'

const INDEX_BITS = 20
const INDEX_MASK = (1 << INDEX_BITS) - 1
const GENERATION_MASK = 0xfff
const MAX_INDEX = INDEX_MASK

export const NULL_ENTITY: Entity = 0

export function entityIndex(entity: Entity): number {
  return entity & INDEX_MASK
}

export function entityGeneration(entity: Entity): number {
  return entity >>> INDEX_BITS
}

export function makeEntity(index: number, generation: number): Entity {
  return (((generation & GENERATION_MASK) << INDEX_BITS) | (index & INDEX_MASK)) >>> 0
}

export interface EntityTableSnapshot {
  readonly maxIndex: number
  readonly generations: readonly number[]
  readonly alive: readonly Entity[]
  readonly free: readonly number[]
}

/**
 * Entity ids are (generation << 20) | index. Index 0 is reserved so 0 can be
 * used as a null id. Released indices are reused lowest-first; when the
 * 12-bit generation is exhausted the index is retired instead of wrapping.
 */
export class EntityStore {
  private generations = new Uint16Array(64)
  private aliveFlags = new Uint8Array(64)
  private freeFlags = new Uint8Array(64)
  private freeHeap: number[] = []
  private highestIndex = 0

  get maxIndex(): number {
    return this.highestIndex
  }

  allocate(): Entity {
    const recycled = this.popFree()
    let index: number
    if (recycled !== undefined) {
      index = recycled
    } else {
      if (this.highestIndex >= MAX_INDEX) {
        throw new LuneGoError('entity_capacity', 'entity index space exhausted')
      }
      this.highestIndex += 1
      index = this.highestIndex
      this.ensureCapacity(index)
    }
    return makeEntity(index, this.generations[index])
  }

  activate(entity: Entity): void {
    const index = entityIndex(entity)
    if (index === 0 || index > this.highestIndex) {
      throw new LuneGoError('stale_entity', `cannot activate unknown entity ${entity}`)
    }
    if (this.aliveFlags[index] === 1) {
      throw new LuneGoError('stale_entity', `entity ${entity} is already alive`)
    }
    if (this.generations[index] !== entityGeneration(entity)) {
      throw new LuneGoError('stale_entity', `entity ${entity} has an expired generation`)
    }
    this.aliveFlags[index] = 1
  }

  release(entity: Entity): void {
    const index = entityIndex(entity)
    this.assertAlive(entity)
    this.aliveFlags[index] = 0
    const nextGeneration = this.generations[index] + 1
    if (nextGeneration > GENERATION_MASK) {
      this.generations[index] = GENERATION_MASK
    } else {
      this.generations[index] = nextGeneration
      this.pushFree(index)
    }
  }

  isAlive(entity: Entity): boolean {
    const index = entityIndex(entity)
    if (index === 0 || index > this.highestIndex || this.aliveFlags[index] !== 1) {
      return false
    }
    return this.generations[index] === entityGeneration(entity)
  }

  assertAlive(entity: Entity): void {
    if (!this.isAlive(entity)) {
      throw new LuneGoError('stale_entity', `entity ${entity} is not alive`, {
        rule: 'LG004',
      })
    }
  }

  aliveEntities(): Entity[] {
    const result: Entity[] = []
    for (let index = 1; index <= this.highestIndex; index += 1) {
      if (this.aliveFlags[index] === 1) {
        result.push(makeEntity(index, this.generations[index]))
      }
    }
    return result
  }

  generationAt(index: number): number {
    return this.generations[index]
  }

  isAliveIndex(index: number): boolean {
    return index > 0 && index <= this.highestIndex && this.aliveFlags[index] === 1
  }

  isFreeIndex(index: number): boolean {
    return index > 0 && index <= this.highestIndex && this.freeFlags[index] === 1
  }

  snapshot(): EntityTableSnapshot {
    const generations = Array.from(this.generations.subarray(0, this.highestIndex + 1))
    const alive: Entity[] = []
    for (let index = 1; index <= this.highestIndex; index += 1) {
      if (this.aliveFlags[index] === 1) {
        alive.push(makeEntity(index, this.generations[index]))
      }
    }
    const free: number[] = []
    for (let index = 1; index <= this.highestIndex; index += 1) {
      if (this.freeFlags[index] === 1) {
        free.push(index)
      }
    }
    return {
      maxIndex: this.highestIndex,
      generations,
      alive,
      free,
    }
  }

  restore(snapshot: EntityTableSnapshot): void {
    const { maxIndex } = snapshot
    if (!Number.isInteger(maxIndex) || maxIndex < 0 || maxIndex > MAX_INDEX) {
      throw new LuneGoError('snapshot_invalid', `invalid entity table maxIndex ${maxIndex}`)
    }
    if (snapshot.generations.length !== maxIndex + 1) {
      throw new LuneGoError(
        'snapshot_invalid',
        'entity table generations do not cover maxIndex',
      )
    }
    this.highestIndex = maxIndex
    const size = nextCapacity(maxIndex)
    this.generations = new Uint16Array(size)
    this.aliveFlags = new Uint8Array(size)
    this.freeFlags = new Uint8Array(size)
    this.freeHeap = []
    for (let index = 0; index <= maxIndex; index += 1) {
      const generation = snapshot.generations[index]
      if (!Number.isInteger(generation) || generation < 0 || generation > GENERATION_MASK) {
        throw new LuneGoError(
          'snapshot_invalid',
          `invalid generation ${String(generation)} at index ${index}`,
        )
      }
      this.generations[index] = generation
    }
    const seenAlive = new Set<number>()
    for (const entity of snapshot.alive) {
      const index = entityIndex(entity)
      if (index === 0 || index > maxIndex || seenAlive.has(index)) {
        throw new LuneGoError('snapshot_invalid', `invalid alive entity ${entity}`)
      }
      if (this.generations[index] !== entityGeneration(entity)) {
        throw new LuneGoError(
          'snapshot_invalid',
          `alive entity ${entity} does not match its generation`,
        )
      }
      seenAlive.add(index)
      this.aliveFlags[index] = 1
    }
    const seenFree = new Set<number>()
    for (const index of snapshot.free) {
      if (
        !Number.isInteger(index) ||
        index <= 0 ||
        index > maxIndex ||
        seenAlive.has(index) ||
        seenFree.has(index)
      ) {
        throw new LuneGoError('snapshot_invalid', `invalid free index ${index}`)
      }
      seenFree.add(index)
    }
    for (const index of snapshot.free) {
      this.pushFree(index)
    }
  }

  private ensureCapacity(index: number): void {
    if (index < this.generations.length) {
      return
    }
    const size = nextCapacity(index)
    const generations = new Uint16Array(size)
    generations.set(this.generations)
    this.generations = generations
    const aliveFlags = new Uint8Array(size)
    aliveFlags.set(this.aliveFlags)
    this.aliveFlags = aliveFlags
    const freeFlags = new Uint8Array(size)
    freeFlags.set(this.freeFlags)
    this.freeFlags = freeFlags
  }

  private pushFree(index: number): void {
    this.freeFlags[index] = 1
    this.freeHeap.push(index)
    let child = this.freeHeap.length - 1
    while (child > 0) {
      const parent = (child - 1) >> 1
      if (this.freeHeap[parent] <= this.freeHeap[child]) {
        break
      }
      const value = this.freeHeap[parent]
      this.freeHeap[parent] = this.freeHeap[child]
      this.freeHeap[child] = value
      child = parent
    }
  }

  private popFree(): number | undefined {
    if (this.freeHeap.length === 0) {
      return undefined
    }
    const top = this.freeHeap[0]
    const last = this.freeHeap.pop()
    if (last === undefined) {
      return undefined
    }
    if (this.freeHeap.length > 0) {
      this.freeHeap[0] = last
      let parent = 0
      for (;;) {
        const left = parent * 2 + 1
        const right = left + 1
        let smallest = parent
        if (left < this.freeHeap.length && this.freeHeap[left] < this.freeHeap[smallest]) {
          smallest = left
        }
        if (right < this.freeHeap.length && this.freeHeap[right] < this.freeHeap[smallest]) {
          smallest = right
        }
        if (smallest === parent) {
          break
        }
        const value = this.freeHeap[parent]
        this.freeHeap[parent] = this.freeHeap[smallest]
        this.freeHeap[smallest] = value
        parent = smallest
      }
    }
    this.freeFlags[top] = 0
    return top
  }
}

function nextCapacity(index: number): number {
  let size = 64
  while (size <= index) {
    size *= 2
  }
  return size
}
