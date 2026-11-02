import type { ContextHost } from './context-host.js'
import type { EventDef, EventPayload } from './definitions.js'
import type { WorldSnapshot } from './snapshot.js'
import { LuneGoError } from './errors.js'

/**
 * Capabilities owned by the kernel and handed to the tick pipeline. They are
 * never reachable through the documented World surface: the accessor lives in
 * `@lunego/core/internal`, which dependency rules reserve for the host and
 * testkit. A WeakMap keeps the capability off the world object, so reflection
 * cannot find or replace it.
 */
export interface WorldInternals extends ContextHost {
  queueEvent<E extends EventDef>(event: E, payload: EventPayload<E>): void
  restore(snapshot: WorldSnapshot): void
}

const registry = (() => {
  const map = new WeakMap<object, WorldInternals>()
  return {
    register(world: object, internals: WorldInternals): void {
      map.set(world, internals)
    },
    get(world: object): WorldInternals | undefined {
      return map.get(world)
    },
  }
})()

export function registerWorldInternals(world: object, internals: WorldInternals): void {
  registry.register(world, internals)
}

export function worldInternals(world: object): WorldInternals {
  const internals = registry.get(world)
  if (internals === undefined) {
    throw new TypeError('value is not a World created by @lunego/core')
  }
  return internals
}

export function assertNotStepping(stepping: boolean, action: string): void {
  if (stepping) {
    throw new LuneGoError('guard_violation', `${action} cannot run during a tick`, {
      rule: 'LG004',
    })
  }
}
