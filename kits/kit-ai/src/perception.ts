import { sqrt } from '@lunego/core/math'

export interface AiAgent {
  readonly entity: number
  readonly x: number
  readonly y: number
}

export interface PerceptionEntry {
  readonly entity: number
  readonly x: number
  readonly y: number
  readonly lastSeenTick: number
  readonly visible: boolean
}

export interface PerceptionOptions {
  readonly range: number
  /** Minimum normalized dot product for the vision cone; default -1 (360°). */
  readonly coneDot?: number
  readonly memoryTicks?: number
}

interface MemoryEntry {
  readonly x: number
  readonly y: number
  lastSeenTick: number
}

/** Deterministic cone/distance perception with tick-based memory. */
export class Perception {
  private readonly rangeSq: number
  private readonly coneDot: number
  private readonly memoryTicks: number
  private readonly memory = new Map<number, MemoryEntry>()
  private readonly listeners = new Set<number>()

  constructor(options: PerceptionOptions) {
    if (!Number.isFinite(options.range) || options.range < 0) {
      throw new Error('perception range must be non-negative')
    }
    this.rangeSq = options.range * options.range
    this.coneDot = options.coneDot ?? -1
    this.memoryTicks = options.memoryTicks ?? 0
  }

  /** Observe candidates and return visible + remembered entries by entity id. */
  observe(
    self: AiAgent,
    facing: { readonly x: number; readonly y: number },
    candidates: readonly AiAgent[],
    tick: number,
  ): readonly PerceptionEntry[] {
    const facingLength = sqrt(facing.x * facing.x + facing.y * facing.y)
    for (const candidate of candidates) {
      if (candidate.entity === self.entity) {
        continue
      }
      const dx = candidate.x - self.x
      const dy = candidate.y - self.y
      const distanceSq = dx * dx + dy * dy
      if (distanceSq > this.rangeSq) {
        continue
      }
      const dot = distanceSq === 0 || facingLength === 0
        ? 1
        : (dx * facing.x + dy * facing.y) / (sqrt(distanceSq) * facingLength)
      if (dot < this.coneDot) {
        continue
      }
      this.memory.set(candidate.entity, { x: candidate.x, y: candidate.y, lastSeenTick: tick })
      this.listeners.add(candidate.entity)
    }
    return this.snapshot(tick)
  }

  snapshot(tick: number): readonly PerceptionEntry[] {
    const result: PerceptionEntry[] = []
    for (const [entity, entry] of [...this.memory.entries()].sort((left, right) => left[0] - right[0])) {
      const visible = tick - entry.lastSeenTick <= this.memoryTicks
      if (!visible) {
        this.memory.delete(entity)
        continue
      }
      result.push({ entity, x: entry.x, y: entry.y, lastSeenTick: entry.lastSeenTick, visible })
    }
    return result
  }

  forget(entity: number): void {
    this.memory.delete(entity)
    this.listeners.delete(entity)
  }

  clear(): void {
    this.memory.clear()
    this.listeners.clear()
  }
}

export interface ThreatEntry {
  readonly entity: number
  readonly threat: number
}

/** Threat table and blacklist; ranking is threat desc, then entity asc. */
export class ThreatTable {
  private readonly threats = new Map<number, number>()
  private readonly blacklisted = new Set<number>()

  add(entity: number, amount: number): void {
    if (!Number.isFinite(amount)) {
      throw new Error('threat must be finite')
    }
    this.threats.set(entity, (this.threats.get(entity) ?? 0) + amount)
  }

  set(entity: number, threat: number): void {
    if (!Number.isFinite(threat)) {
      throw new Error('threat must be finite')
    }
    this.threats.set(entity, threat)
  }

  remove(entity: number): void {
    this.threats.delete(entity)
  }

  blacklist(entity: number): void {
    this.blacklisted.add(entity)
  }

  unblacklist(entity: number): void {
    this.blacklisted.delete(entity)
  }

  isBlacklisted(entity: number): boolean {
    return this.blacklisted.has(entity)
  }

  ranked(): readonly ThreatEntry[] {
    return [...this.threats.entries()]
      .filter(([entity]) => !this.blacklisted.has(entity))
      .sort((left, right) => right[1] - left[1] || left[0] - right[0])
      .map(([entity, threat]) => ({ entity, threat }))
  }

  clear(): void {
    this.threats.clear()
    this.blacklisted.clear()
  }
}

export interface UtilityAction<Context> {
  readonly id: string
  readonly canRun?: (context: Context) => boolean
  readonly score: (context: Context) => number
}

/** Selects the highest utility; ties break on action id (code point). */
export function selectUtility<Context>(
  actions: readonly UtilityAction<Context>[],
  context: Context,
): UtilityAction<Context> | null {
  let selected: UtilityAction<Context> | null = null
  let selectedScore = Number.NEGATIVE_INFINITY
  for (const action of actions) {
    if (action.canRun !== undefined && !action.canRun(context)) {
      continue
    }
    const score = action.score(context)
    if (!Number.isFinite(score)) {
      continue
    }
    if (
      selected === null ||
      score > selectedScore ||
      (score === selectedScore && action.id < selected.id)
    ) {
      selected = action
      selectedScore = score
    }
  }
  return selected
}
