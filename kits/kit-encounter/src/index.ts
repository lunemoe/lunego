import type { RngStream } from '@lunego/core'
import { weightedPick, type LootTable } from '@lunego/kit-loot'

export interface Point {
  readonly x: number
  readonly y: number
}

export interface SpawnPoint {
  readonly x: number
  readonly y: number
}

export interface SpawnEntry {
  readonly id: string
  readonly weight: number
  readonly cost?: number
  readonly tags?: readonly string[]
  readonly lootTable?: string
}

export interface SpawnTable {
  readonly entries: readonly SpawnEntry[]
  readonly tags?: readonly string[]
}

export interface EncounterWave {
  readonly id: string
  readonly spawnTable: SpawnTable
  readonly count: number
  readonly spawnPoints?: readonly SpawnPoint[]
  readonly phase?: string
}

export interface EncounterPhase {
  readonly id: string
  /** Enter this phase at or below this health fraction. */
  readonly healthBelow: number
}

export interface DifficultyScaling {
  scaleCount(base: number): number
  scaleCost(base: number): number
}

export interface EncounterDef {
  readonly id: string
  readonly waves: readonly EncounterWave[]
  readonly leash?: { readonly origin: Point; readonly radius: number }
  readonly budget?: number
  readonly phases?: readonly EncounterPhase[]
  readonly difficulty?: DifficultyScaling
  readonly lootTables?: Readonly<Record<string, LootTable>>
  readonly tags?: readonly string[]
}

export interface SpawnedEntity {
  readonly entity: string
  readonly contentId: string
  readonly x: number
  readonly y: number
  readonly wave: string
  readonly cost: number
}

export interface SpawnResult {
  readonly ok: boolean
  readonly reason?: 'budget' | 'spawn_points' | 'empty'
  readonly spawned: readonly SpawnedEntity[]
}

export interface EncounterState {
  readonly waveIndex: number
  readonly phase: string | null
  readonly spawned: readonly SpawnedEntity[]
  readonly spent: number
}

export interface EncounterRuntimeOptions {
  readonly def: EncounterDef
  readonly rng: RngStream
  readonly spawnPoints: readonly SpawnPoint[]
  readonly state?: EncounterState
}

function validateWave(wave: EncounterWave): void {
  if (wave.id.length === 0 || !Number.isInteger(wave.count) || wave.count < 0) {
    throw new Error(`encounter wave ${wave.id} is invalid`)
  }
  for (const entry of wave.spawnTable.entries) {
    if (entry.id.length === 0 || !Number.isFinite(entry.weight) || entry.weight < 0) {
      throw new Error(`spawn entry ${entry.id} is invalid`)
    }
  }
}

function entryAllowed(entry: SpawnEntry, tags: readonly string[] | undefined): boolean {
  if (tags === undefined || tags.length === 0) {
    return true
  }
  const entryTags = entry.tags ?? []
  return tags.some((tag) => entryTags.includes(tag))
}

/** Deterministic encounter wave/spawner with budget, leash, phases and loot requests. */
export class EncounterRuntime {
  readonly def: EncounterDef
  private readonly rng: RngStream
  private readonly spawnPoints: readonly SpawnPoint[]
  private waveIndexValue = 0
  private phaseValue: string | null = null
  private spawnedValue: SpawnedEntity[] = []
  private spentValue = 0
  private lootRequestsValue: string[] = []

  constructor(options: EncounterRuntimeOptions) {
    this.def = options.def
    if (options.def.waves.length === 0) {
      throw new Error('encounter must define at least one wave')
    }
    for (const wave of options.def.waves) {
      validateWave(wave)
    }
    this.rng = options.rng
    this.spawnPoints = [...options.spawnPoints]
    if (options.state !== undefined) {
      this.restore(options.state)
    }
  }

  get waveIndex(): number {
    return this.waveIndexValue
  }

  get phase(): string | null {
    return this.phaseValue
  }

  get spawned(): readonly SpawnedEntity[] {
    return [...this.spawnedValue]
  }

  get spent(): number {
    return this.spentValue
  }

  get lootRequests(): readonly string[] {
    return [...this.lootRequestsValue]
  }

  start(): SpawnResult {
    this.waveIndexValue = 0
    this.phaseValue = this.def.waves[0]?.phase ?? this.phaseAt(1)
    this.spawnedValue = []
    this.spentValue = 0
    this.lootRequestsValue = []
    return this.spawnCurrentWave()
  }

  nextWave(): SpawnResult {
    if (this.waveIndexValue + 1 >= this.def.waves.length) {
      return { ok: false, reason: 'empty', spawned: [] }
    }
    this.waveIndexValue += 1
    this.phaseValue = this.def.waves[this.waveIndexValue]?.phase ?? this.phaseAt(1)
    return this.spawnCurrentWave()
  }

  spawnCurrentWave(): SpawnResult {
    const wave = this.def.waves[this.waveIndexValue]
    if (wave === undefined) {
      return { ok: false, reason: 'empty', spawned: [] }
    }
    const points = wave.spawnPoints ?? this.spawnPoints
    if (points.length === 0) {
      return { ok: false, reason: 'spawn_points', spawned: [] }
    }
    const difficulty = this.def.difficulty
    const count = Math.max(0, Math.floor(difficulty?.scaleCount(wave.count) ?? wave.count))
    if (count === 0) {
      return { ok: true, spawned: [] }
    }
    const allowed = wave.spawnTable.entries.filter((entry) =>
      entryAllowed(entry, wave.spawnTable.tags),
    )
    if (allowed.length === 0) {
      return { ok: false, reason: 'empty', spawned: [] }
    }
    const plan: { entry: SpawnEntry; point: SpawnPoint; cost: number }[] = []
    let plannedCost = 0
    for (let index = 0; index < count; index += 1) {
      const entry = weightedPick(this.rng, allowed.map((value) => ({ value, weight: value.weight })))
      const cost = Math.max(0, Math.floor(difficulty?.scaleCost(entry.cost ?? 1) ?? (entry.cost ?? 1)))
      const point = points[index % points.length]
      if (point === undefined) {
        return { ok: false, reason: 'spawn_points', spawned: [] }
      }
      plannedCost += cost
      if (this.def.budget !== undefined && this.spentValue + plannedCost > this.def.budget) {
        return { ok: false, reason: 'budget', spawned: [] }
      }
      plan.push({ entry, point, cost })
    }
    const spawned: SpawnedEntity[] = plan.map(({ entry, point, cost }, index) => ({
      entity: `${this.def.id}:${wave.id}:${index}`,
      contentId: entry.id,
      x: point.x,
      y: point.y,
      wave: wave.id,
      cost,
    }))
    this.spawnedValue = [...this.spawnedValue, ...spawned]
    this.spentValue += plannedCost
    for (const { entry } of plan) {
      if (entry.lootTable !== undefined && this.def.lootTables?.[entry.lootTable] !== undefined) {
        this.lootRequestsValue.push(entry.lootTable)
      }
    }
    return { ok: true, spawned }
  }

  /** Leash reset returns true when the party left the encounter area. */
  checkLeash(position: Point): boolean {
    const leash = this.def.leash
    if (leash === undefined) {
      return false
    }
    const dx = position.x - leash.origin.x
    const dy = position.y - leash.origin.y
    if (dx * dx + dy * dy <= leash.radius * leash.radius) {
      return false
    }
    this.reset()
    return true
  }

  reset(): void {
    this.waveIndexValue = 0
    this.phaseValue = this.def.waves[0]?.phase ?? this.phaseAt(1)
    this.spawnedValue = []
    this.spentValue = 0
    this.lootRequestsValue = []
  }

  /** Boss phase lookup by current health fraction; deterministic threshold order. */
  phaseAt(healthFraction: number): string | null {
    const phases = [...(this.def.phases ?? [])].sort((left, right) => left.healthBelow - right.healthBelow)
    for (const phase of phases) {
      if (healthFraction <= phase.healthBelow) {
        return phase.id
      }
    }
    return null
  }

  transitionPhase(healthFraction: number): string | null {
    const next = this.phaseAt(healthFraction)
    if (next !== null && next !== this.phaseValue) {
      this.phaseValue = next
    }
    return this.phaseValue
  }

  serialize(): EncounterState {
    return {
      waveIndex: this.waveIndexValue,
      phase: this.phaseValue,
      spawned: this.spawnedValue.map((entity) => ({ ...entity })),
      spent: this.spentValue,
    }
  }

  restore(state: EncounterState): void {
    if (!Number.isInteger(state.waveIndex) || state.waveIndex < 0 || state.waveIndex >= this.def.waves.length) {
      throw new Error('invalid encounter wave index')
    }
    this.waveIndexValue = state.waveIndex
    this.phaseValue = state.phase
    this.spawnedValue = state.spawned.map((entity) => ({ ...entity }))
    this.spentValue = state.spent
  }
}
