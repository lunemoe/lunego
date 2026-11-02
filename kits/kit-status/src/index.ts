import type { StatBlock, StatModifier } from '@lunego/kit-stats'

export type PeriodicKind = 'dot' | 'hot'

export interface PeriodicEffect {
  readonly kind: PeriodicKind
  readonly intervalTicks: number
  readonly amount: number
}

export interface StatusDef {
  readonly id: string
  /** Duration in ticks; expiry is absolute: applyTick + durationTicks. */
  readonly durationTicks: number
  readonly maxStacks?: number
  readonly periodic?: PeriodicEffect
  readonly control?: string
  readonly modifiers?: readonly StatModifier[]
}

export interface StatusInstance {
  readonly id: string
  readonly def: StatusDef
  readonly source: string
  readonly stacks: number
  readonly appliedTick: number
  readonly expiresAt: number
  readonly nextPeriodicTick: number
}

export interface StatusTickEvent {
  readonly status: string
  readonly source: string
  readonly kind: PeriodicKind
  readonly amount: number
  readonly stacks: number
  readonly tick: number
}

export type StatusDefCatalog = Readonly<Record<string, StatusDef>> | ReadonlyMap<string, StatusDef>

export interface StatusSnapshot {
  /** StatusDef id. */
  readonly status: string
  readonly source: string
  readonly stacks: number
  readonly appliedTick: number
  readonly expiresAt: number
  /** Next periodic tick, or null for non-periodic statuses. */
  readonly nextTick: number | null
}

export interface StatusSetSnapshot {
  readonly version: 1
  readonly statuses: readonly StatusSnapshot[]
}

function lookupStatusDef(catalog: StatusDefCatalog, id: string): StatusDef | undefined {
  if (catalog instanceof Map) {
    return (catalog as ReadonlyMap<string, StatusDef>).get(id)
  }
  return (catalog as Readonly<Record<string, StatusDef>>)[id]
}

function snapshotObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function snapshotInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`)
  }
  return value
}

function modifierSource(id: string, source: string): string {
  return `status:${id}:${source}`
}

function validate(def: StatusDef): void {
  if (def.id.length === 0) {
    throw new Error('status id must not be empty')
  }
  if (!Number.isInteger(def.durationTicks) || def.durationTicks < 0) {
    throw new Error(`status ${def.id} durationTicks must be a non-negative integer`)
  }
  if (def.maxStacks !== undefined && (!Number.isInteger(def.maxStacks) || def.maxStacks < 1)) {
    throw new Error(`status ${def.id} maxStacks must be a positive integer`)
  }
  if (def.periodic !== undefined) {
    if (!Number.isInteger(def.periodic.intervalTicks) || def.periodic.intervalTicks < 1) {
      throw new Error(`status ${def.id} periodic interval must be positive`)
    }
    if (!Number.isFinite(def.periodic.amount) || def.periodic.amount < 0) {
      throw new Error(`status ${def.id} periodic amount must be non-negative`)
    }
  }
}

/** Tick-based status set with stacks, refresh, source removal and periodic events. */
export class StatusSet {
  private readonly instances = new Map<string, StatusInstance>()
  private readonly modifierSources = new Set<string>()

  get active(): readonly StatusInstance[] {
    return [...this.instances.values()].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : left.source < right.source ? -1 : 1,
    )
  }

  apply(def: StatusDef, source: string, tick: number, stacks = 1): StatusInstance {
    validate(def)
    if (!Number.isInteger(stacks) || stacks < 1) {
      throw new Error('status stacks must be a positive integer')
    }
    if (source.length === 0) {
      throw new Error('status source must not be empty')
    }
    const key = `${def.id}\u0000${source}`
    const existing = this.instances.get(key)
    const maxStacks = def.maxStacks ?? 1
    const nextStacks = existing === undefined
      ? Math.min(stacks, maxStacks)
      : Math.min(existing.stacks + stacks, maxStacks)
    const instance: StatusInstance = {
      id: key,
      def,
      source,
      stacks: nextStacks,
      appliedTick: tick,
      expiresAt: tick + def.durationTicks,
      nextPeriodicTick: def.periodic === undefined
        ? Number.POSITIVE_INFINITY
        : tick + def.periodic.intervalTicks,
    }
    this.instances.set(key, instance)
    this.modifierSources.add(modifierSource(def.id, source))
    return instance
  }

  remove(id: string, source?: string): void {
    if (source === undefined) {
      for (const key of [...this.instances.keys()]) {
        if (key.startsWith(`${id}\u0000`)) {
          this.instances.delete(key)
        }
      }
      return
    }
    this.instances.delete(`${id}\u0000${source}`)
  }

  removeSource(source: string): void {
    for (const [key, instance] of [...this.instances.entries()]) {
      if (instance.source === source) {
        this.instances.delete(key)
      }
    }
  }

  has(id: string, source?: string): boolean {
    if (source !== undefined) {
      return this.instances.has(`${id}\u0000${source}`)
    }
    return [...this.instances.values()].some((instance) => instance.def.id === id)
  }

  controls(): readonly string[] {
    const result = new Set<string>()
    for (const instance of this.instances.values()) {
      if (instance.def.control !== undefined) {
        result.add(instance.def.control)
      }
    }
    return [...result].sort()
  }

  /**
   * Advances expiry and periodic effects. A large tick jump emits every due
   * period in ascending order, so the count is independent of frame size.
   */
  tick(tick: number, stats?: StatBlock): readonly StatusTickEvent[] {
    const events: StatusTickEvent[] = []
    for (const [key, instance] of [...this.instances.entries()]) {
      if (tick >= instance.expiresAt) {
        const expiredPeriodic = instance.def.periodic
        if (expiredPeriodic !== undefined) {
          let expiredTick = instance.nextPeriodicTick
          while (expiredTick < instance.expiresAt) {
            events.push({
              status: instance.def.id,
              source: instance.source,
              kind: expiredPeriodic.kind,
              amount: expiredPeriodic.amount * instance.stacks,
              stacks: instance.stacks,
              tick: expiredTick,
            })
            expiredTick += expiredPeriodic.intervalTicks
          }
        }
        this.instances.delete(key)
        stats?.removeSource(modifierSource(instance.def.id, instance.source))
        continue
      }
      const periodic = instance.def.periodic
      if (periodic === undefined) {
        continue
      }
      let next = instance.nextPeriodicTick
      while (next <= tick) {
        events.push({
          status: instance.def.id,
          source: instance.source,
          kind: periodic.kind,
          amount: periodic.amount * instance.stacks,
          stacks: instance.stacks,
          tick: next,
        })
        next += periodic.intervalTicks
      }
      this.instances.set(key, { ...instance, nextPeriodicTick: next })
    }
    return events.sort((left, right) =>
      left.tick - right.tick ||
      (left.status < right.status ? -1 : left.status > right.status ? 1 : 0) ||
      (left.source < right.source ? -1 : left.source > right.source ? 1 : 0),
    )
  }

  /** Applies/refreshes all status modifiers on a stat block. */
  syncModifiers(stats: StatBlock): void {
    for (const source of this.modifierSources) {
      stats.removeSource(source)
    }
    for (const instance of this.instances.values()) {
      for (const modifier of instance.def.modifiers ?? []) {
        stats.add(modifier, modifierSource(instance.def.id, instance.source))
      }
    }
  }

  serialize(): StatusSetSnapshot {
    const statuses = this.active.map((instance): StatusSnapshot => ({
      status: instance.def.id,
      source: instance.source,
      stacks: instance.stacks,
      appliedTick: instance.appliedTick,
      expiresAt: instance.expiresAt,
      nextTick: Number.isFinite(instance.nextPeriodicTick) ? instance.nextPeriodicTick : null,
    }))
    return { version: 1, statuses }
  }

  /**
   * Replaces all state from a snapshot. `defs` is caller-owned content; an
   * unknown status id or a duplicate status/source key throws instead of
   * silently dropping state. When `stats` is provided, old modifier sources
   * are removed and the restored ones are re-applied.
   */
  restore(snapshot: StatusSetSnapshot, defs: StatusDefCatalog, stats?: StatBlock): void {
    const root = snapshotObject(snapshot, 'status snapshot')
    if (root['version'] !== 1) {
      throw new Error('status snapshot version must be 1')
    }
    if (!Array.isArray(root['statuses'])) {
      throw new Error('status snapshot statuses must be an array')
    }
    const instances = new Map<string, StatusInstance>()
    const modifierSources = new Set<string>()
    for (let index = 0; index < root['statuses'].length; index += 1) {
      const entry = snapshotObject(root['statuses'][index], `status snapshot statuses[${index}]`)
      if (typeof entry['status'] !== 'string' || entry['status'].length === 0) {
        throw new Error(`status snapshot statuses[${index}].status must be non-empty`)
      }
      if (typeof entry['source'] !== 'string' || entry['source'].length === 0) {
        throw new Error(`status snapshot statuses[${index}].source must be non-empty`)
      }
      const def = lookupStatusDef(defs, entry['status'])
      if (def === undefined) {
        throw new Error(`status snapshot references unknown status ${entry['status']}`)
      }
      validate(def)
      const stacks = snapshotInteger(entry['stacks'], `status snapshot statuses[${index}].stacks`)
      if (stacks < 1 || stacks > (def.maxStacks ?? 1)) {
        throw new Error(`status snapshot ${def.id} stacks ${stacks} exceed maxStacks`)
      }
      const appliedTick = snapshotInteger(entry['appliedTick'], `status snapshot statuses[${index}].appliedTick`)
      const expiresAt = snapshotInteger(entry['expiresAt'], `status snapshot statuses[${index}].expiresAt`)
      if (expiresAt < appliedTick) {
        throw new Error(`status snapshot ${def.id} expires before it is applied`)
      }
      const nextTick = entry['nextTick'] === null
        ? null
        : snapshotInteger(entry['nextTick'], `status snapshot statuses[${index}].nextTick`)
      if (def.periodic === undefined && nextTick !== null) {
        throw new Error(`status snapshot ${def.id} has nextTick without a periodic effect`)
      }
      if (def.periodic !== undefined && nextTick === null) {
        throw new Error(`status snapshot ${def.id} requires nextTick for its periodic effect`)
      }
      const source = entry['source']
      const key = `${def.id}\u0000${source}`
      if (instances.has(key)) {
        throw new Error(`status snapshot repeats ${def.id} from ${source}`)
      }
      const instance: StatusInstance = {
        id: key,
        def,
        source,
        stacks,
        appliedTick,
        expiresAt,
        nextPeriodicTick: nextTick === null ? Number.POSITIVE_INFINITY : nextTick,
      }
      instances.set(key, instance)
      modifierSources.add(modifierSource(def.id, source))
    }
    if (stats !== undefined) {
      for (const source of this.modifierSources) {
        stats.removeSource(source)
      }
    }
    this.instances.clear()
    this.modifierSources.clear()
    for (const [key, instance] of instances) {
      this.instances.set(key, instance)
    }
    for (const source of modifierSources) {
      this.modifierSources.add(source)
    }
    if (stats !== undefined) {
      this.syncModifiers(stats)
    }
  }

  clear(stats?: StatBlock): void {
    if (stats !== undefined) {
      for (const source of this.modifierSources) {
        stats.removeSource(source)
      }
    }
    this.instances.clear()
  }
}
