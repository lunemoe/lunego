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

export interface MemorySnapshotEntry {
  readonly entity: number
  readonly x: number
  readonly y: number
  readonly lastSeenTick: number
}

export interface PerceptionSnapshot {
  readonly version: 1
  readonly memory: readonly MemorySnapshotEntry[]
  /** Entities observed at least once; caller may prune dead ids explicitly. */
  readonly seen: readonly number[]
}

export interface EntityValidation {
  /** Return false to reject unknown/dead entity references during restore. */
  readonly isValidEntity?: (entity: number) => boolean
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

function snapshotObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function entityId(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`)
  }
  return value
}

function validEntity(entity: number, options: EntityValidation): void {
  if (options.isValidEntity !== undefined && !options.isValidEntity(entity)) {
    throw new Error(`snapshot references unknown or dead entity ${entity}`)
  }
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

  serialize(): PerceptionSnapshot {
    return {
      version: 1,
      memory: [...this.memory.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([entity, entry]) => ({
          entity,
          x: entry.x,
          y: entry.y,
          lastSeenTick: entry.lastSeenTick,
        })),
      seen: [...this.listeners].sort((left, right) => left - right),
    }
  }

  restore(snapshot: PerceptionSnapshot, options: EntityValidation = {}): void {
    const root = snapshotObject(snapshot, 'perception snapshot')
    if (root['version'] !== 1) {
      throw new Error('perception snapshot version must be 1')
    }
    if (!Array.isArray(root['memory']) || !Array.isArray(root['seen'])) {
      throw new Error('perception snapshot requires memory and seen arrays')
    }
    const memory = new Map<number, MemoryEntry>()
    for (let index = 0; index < root['memory'].length; index += 1) {
      const entry = snapshotObject(root['memory'][index], `perception memory[${index}]`)
      const entity = entityId(entry['entity'], `perception memory[${index}].entity`)
      validEntity(entity, options)
      if (memory.has(entity)) {
        throw new Error(`perception snapshot repeats entity ${entity}`)
      }
      if (typeof entry['x'] !== 'number' || !Number.isFinite(entry['x'])) {
        throw new Error(`perception memory[${index}].x must be finite`)
      }
      if (typeof entry['y'] !== 'number' || !Number.isFinite(entry['y'])) {
        throw new Error(`perception memory[${index}].y must be finite`)
      }
      const lastSeenTick = entry['lastSeenTick']
      if (typeof lastSeenTick !== 'number' || !Number.isInteger(lastSeenTick)) {
        throw new Error(`perception memory[${index}].lastSeenTick must be an integer`)
      }
      memory.set(entity, { x: entry['x'], y: entry['y'], lastSeenTick })
    }
    const seen = new Set<number>()
    for (let index = 0; index < root['seen'].length; index += 1) {
      const entity = entityId(root['seen'][index], `perception seen[${index}]`)
      validEntity(entity, options)
      if (seen.has(entity)) {
        throw new Error(`perception snapshot repeats seen entity ${entity}`)
      }
      seen.add(entity)
    }
    this.memory.clear()
    this.listeners.clear()
    for (const [entity, entry] of memory) {
      this.memory.set(entity, entry)
    }
    for (const entity of seen) {
      this.listeners.add(entity)
    }
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

export interface ThreatTableSnapshot {
  readonly version: 1
  readonly threats: readonly ThreatEntry[]
  readonly blacklist: readonly number[]
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

  serialize(): ThreatTableSnapshot {
    return {
      version: 1,
      threats: [...this.threats.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([entity, threat]) => ({ entity, threat })),
      blacklist: [...this.blacklisted].sort((left, right) => left - right),
    }
  }

  restore(snapshot: ThreatTableSnapshot, options: EntityValidation = {}): void {
    const root = snapshotObject(snapshot, 'threat snapshot')
    if (root['version'] !== 1) {
      throw new Error('threat snapshot version must be 1')
    }
    if (!Array.isArray(root['threats']) || !Array.isArray(root['blacklist'])) {
      throw new Error('threat snapshot requires threats and blacklist arrays')
    }
    const threats = new Map<number, number>()
    for (let index = 0; index < root['threats'].length; index += 1) {
      const entry = snapshotObject(root['threats'][index], `threat snapshot threats[${index}]`)
      const entity = entityId(entry['entity'], `threat snapshot threats[${index}].entity`)
      validEntity(entity, options)
      if (threats.has(entity)) {
        throw new Error(`threat snapshot repeats entity ${entity}`)
      }
      if (typeof entry['threat'] !== 'number' || !Number.isFinite(entry['threat'])) {
        throw new Error(`threat snapshot threats[${index}].threat must be finite`)
      }
      threats.set(entity, entry['threat'])
    }
    const blacklisted = new Set<number>()
    for (let index = 0; index < root['blacklist'].length; index += 1) {
      const entity = entityId(root['blacklist'][index], `threat snapshot blacklist[${index}]`)
      validEntity(entity, options)
      if (blacklisted.has(entity)) {
        throw new Error(`threat snapshot repeats blacklisted entity ${entity}`)
      }
      blacklisted.add(entity)
    }
    this.threats.clear()
    this.blacklisted.clear()
    for (const [entity, threat] of threats) {
      this.threats.set(entity, threat)
    }
    for (const entity of blacklisted) {
      this.blacklisted.add(entity)
    }
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
