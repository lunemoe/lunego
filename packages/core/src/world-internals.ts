import type { ContextHost } from './context-host.js'
import type { EventDef, EventPayload } from './definitions.js'
import type { WorldSnapshot } from './snapshot.js'
import { LuneGoError } from './errors.js'

/**
 * Capabilities owned by the kernel and handed to the tick pipeline. They are
 * never reachable through the documented World surface: the accessor lives in
 * `@lunego/core/internal`, which dependency rules reserve for the host and
 * testkit. Storing them on a per-world symbol keeps the registry free of
 * module-level mutable state.
 */
export interface WorldInternals extends ContextHost {
  queueEvent<E extends EventDef>(event: E, payload: EventPayload<E>): void
  restore(snapshot: WorldSnapshot): void
}

export const INTERNALS: unique symbol = Symbol('lunego.world-internals')

interface InternalsCarrier {
  readonly [INTERNALS]?: WorldInternals
}

export function worldInternals(world: object): WorldInternals {
  const internals = (world as InternalsCarrier)[INTERNALS]
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
