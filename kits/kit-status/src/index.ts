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

  clear(stats?: StatBlock): void {
    if (stats !== undefined) {
      for (const source of this.modifierSources) {
        stats.removeSource(source)
      }
    }
    this.instances.clear()
  }
}
