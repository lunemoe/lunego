import type { RngStream } from '@lunego/core'

export type BtStatus = 'success' | 'failure' | 'running'

export interface BtNode<Context> {
  run(context: Context): BtStatus
}

export function btSequence<Context>(...nodes: readonly BtNode<Context>[]): BtNode<Context> {
  return {
    run(context) {
      for (const node of nodes) {
        const status = node.run(context)
        if (status !== 'success') {
          return status
        }
      }
      return 'success'
    },
  }
}

export function btSelector<Context>(...nodes: readonly BtNode<Context>[]): BtNode<Context> {
  return {
    run(context) {
      for (const node of nodes) {
        const status = node.run(context)
        if (status !== 'failure') {
          return status
        }
      }
      return 'failure'
    },
  }
}

export function btCondition<Context>(
  predicate: (context: Context) => boolean,
): BtNode<Context> {
  return { run: (context) => (predicate(context) ? 'success' : 'failure') }
}

export function btAction<Context>(
  action: (context: Context) => BtStatus | void,
): BtNode<Context> {
  return { run: (context) => action(context) ?? 'success' }
}

export class Blackboard<Data extends Record<string, unknown>> {
  private readonly data: Data

  constructor(initial: Data) {
    this.data = { ...initial }
  }

  get<Key extends keyof Data>(key: Key): Data[Key] {
    return this.data[key]
  }

  set<Key extends keyof Data>(key: Key, value: Data[Key]): void {
    this.data[key] = value
  }

  snapshot(): Readonly<Data> {
    return { ...this.data }
  }

  /** Restores all known keys; missing or unknown keys fail explicitly. */
  restore(snapshot: Readonly<Data>): void {
    for (const key of Object.keys(this.data)) {
      if (!Object.prototype.hasOwnProperty.call(snapshot, key)) {
        throw new Error(`blackboard snapshot is missing key ${key}`)
      }
    }
    for (const key of Object.keys(snapshot)) {
      if (!Object.prototype.hasOwnProperty.call(this.data, key)) {
        throw new Error(`blackboard snapshot has unknown key ${key}`)
      }
    }
    Object.assign(this.data, snapshot)
  }
}

export class AgentGroup<T extends { readonly entity: number }> {
  private readonly members = new Map<number, T>()

  add(member: T): void {
    this.members.set(member.entity, member)
  }

  remove(entity: number): void {
    this.members.delete(entity)
  }

  get size(): number {
    return this.members.size
  }

  values(): readonly T[] {
    return [...this.members.values()].sort((left, right) => left.entity - right.entity)
  }

  nearest(
    point: { readonly x: number; readonly y: number },
    filter?: (member: T) => boolean,
  ): T | null {
    let best: T | null = null
    let bestDistance = Number.POSITIVE_INFINITY
    for (const member of this.values()) {
      if (filter !== undefined && !filter(member)) {
        continue
      }
      const value = member as T & { readonly x?: number; readonly y?: number }
      if (value.x === undefined || value.y === undefined) {
        continue
      }
      const dx = value.x - point.x
      const dy = value.y - point.y
      const distance = dx * dx + dy * dy
      if (distance < bestDistance) {
        best = member
        bestDistance = distance
      }
    }
    return best
  }
}

export interface Leash {
  readonly origin: { readonly x: number; readonly y: number }
  readonly radius: number
}

export function withinLeash(
  leash: Leash,
  point: { readonly x: number; readonly y: number },
): boolean {
  const dx = point.x - leash.origin.x
  const dy = point.y - leash.origin.y
  return dx * dx + dy * dy <= leash.radius * leash.radius
}

export interface PhaseState {
  readonly phase: string
  readonly sinceTick: number
}

export function transitionPhase(
  state: PhaseState,
  phase: string,
  tick: number,
): PhaseState {
  return state.phase === phase ? state : { phase, sinceTick: tick }
}

/** Optional deterministic RNG hook; AI code never reads a global random source. */
export interface AiContext {
  readonly tick: number
  readonly rng?: RngStream
}
