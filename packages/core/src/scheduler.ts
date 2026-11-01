import type { Phase, SystemDef } from './definitions.js'
import { registrationError } from './errors.js'
import type { RuleId } from './errors.js'

export interface RegisteredSystem {
  readonly def: SystemDef
  readonly feature: string
}

export interface Diagnostic {
  readonly code: string
  readonly message: string
  readonly rule: RuleId | null
}

export type PhaseSchedule = Readonly<Record<Phase, readonly SystemDef[]>>

export const PHASES: readonly Phase[] = ['pre', 'update', 'post']

const phaseRank: Readonly<Record<Phase, number>> = {
  pre: 0,
  update: 1,
  post: 2,
}

function nameOrder(a: SystemDef, b: SystemDef): number {
  if (a.name < b.name) {
    return -1
  }
  if (a.name > b.name) {
    return 1
  }
  return 0
}

function addEdge(
  edges: Map<SystemDef, Set<SystemDef>>,
  indegree: Map<SystemDef, number>,
  from: SystemDef,
  to: SystemDef,
): void {
  if (from === to) {
    return
  }
  const successors = edges.get(from)
  if (successors === undefined) {
    throw registrationError(`unknown system ${from.name}`)
  }
  if (successors.has(to)) {
    return
  }
  successors.add(to)
  indegree.set(to, (indegree.get(to) ?? 0) + 1)
}

function reaches(edges: Map<SystemDef, Set<SystemDef>>, from: SystemDef, to: SystemDef): boolean {
  const stack: SystemDef[] = [from]
  const seen = new Set<SystemDef>()
  while (stack.length > 0) {
    const current = stack.pop()
    if (current === undefined) {
      break
    }
    if (current === to) {
      return true
    }
    if (seen.has(current)) {
      continue
    }
    seen.add(current)
    for (const next of edges.get(current) ?? []) {
      stack.push(next)
    }
  }
  return false
}

function stateNames(defs: readonly { readonly name: string }[]): Set<string> {
  return new Set(defs.map((def) => def.name))
}

/**
 * Builds the per-phase order. Explicit after/before and same-tick event
 * dependencies are edges; ties break on system name. Conflicts that would
 * depend on registration order are reported instead of silently accepted.
 */
export function buildSchedule(
  systems: readonly RegisteredSystem[],
  report: (diagnostic: Diagnostic) => void,
): PhaseSchedule {
  const byName = new Map<string, SystemDef>()
  const byDef = new Map<SystemDef, SystemDef>()
  for (const { def } of systems) {
    const existing = byName.get(def.name)
    if (existing !== undefined) {
      throw registrationError(`duplicate system name ${def.name}`)
    }
    if (byDef.has(def)) {
      throw registrationError(`system ${def.name} is registered twice`)
    }
    if (def.phase !== 'pre' && def.phase !== 'update' && def.phase !== 'post') {
      throw registrationError(`system ${def.name} has invalid phase ${String(def.phase)}`)
    }
    byName.set(def.name, def)
    byDef.set(def, def)
  }

  const edges = new Map<SystemDef, Set<SystemDef>>()
  const indegree = new Map<SystemDef, number>()
  for (const { def } of systems) {
    edges.set(def, new Set<SystemDef>())
    indegree.set(def, 0)
  }

  for (const { def } of systems) {
    for (const target of def.after) {
      if (!byDef.has(target)) {
        throw registrationError(`system ${def.name} orders after an unregistered system`)
      }
      if (target.phase !== def.phase) {
        throw registrationError(
          `system ${def.name} orders after ${target.name} across phases; phases already impose order`,
        )
      }
      addEdge(edges, indegree, target, def)
    }
    for (const target of def.before) {
      if (!byDef.has(target)) {
        throw registrationError(`system ${def.name} orders before an unregistered system`)
      }
      if (target.phase !== def.phase) {
        throw registrationError(
          `system ${def.name} orders before ${target.name} across phases; phases already impose order`,
        )
      }
      addEdge(edges, indegree, def, target)
    }
  }

  for (const emitter of systems) {
    for (const event of emitter.def.emits) {
      for (const listener of systems) {
        for (const listen of listener.def.listens) {
          if (listen.prev || listen.event !== event) {
            continue
          }
          if (emitter === listener) {
            continue
          }
          const emitterRank = phaseRank[emitter.def.phase]
          const listenerRank = phaseRank[listener.def.phase]
          if (emitterRank > listenerRank) {
            throw registrationError(
              `system ${listener.def.name} listens to ${event.name} from a later phase; use { prev: true }`,
            )
          }
          if (emitterRank === listenerRank) {
            addEdge(edges, indegree, emitter.def, listener.def)
          }
        }
      }
    }
  }

  const ordered: SystemDef[] = []
  const ready = systems
    .map(({ def }) => def)
    .filter((def) => (indegree.get(def) ?? 0) === 0)
    .sort(nameOrder)
  while (ready.length > 0) {
    const next = ready.shift()
    if (next === undefined) {
      break
    }
    ordered.push(next)
    for (const successor of edges.get(next) ?? []) {
      const remaining = (indegree.get(successor) ?? 0) - 1
      indegree.set(successor, remaining)
      if (remaining === 0) {
        ready.push(successor)
        ready.sort(nameOrder)
      }
    }
  }

  if (ordered.length !== systems.length) {
    const stuck = systems
      .map(({ def }) => def)
      .filter((def) => !ordered.includes(def))
      .map((def) => def.name)
      .sort()
    throw registrationError(
      `system ordering cycle: ${stuck.join(' -> ')}; check after/before and event dependencies`,
    )
  }

  for (const phase of PHASES) {
    const phaseSystems = ordered.filter((def) => def.phase === phase)
    for (let left = 0; left < phaseSystems.length; left += 1) {
      for (let right = left + 1; right < phaseSystems.length; right += 1) {
        const a = phaseSystems[left]
        const b = phaseSystems[right]
        if (reaches(edges, a, b) || reaches(edges, b, a)) {
          continue
        }
        const aWrites = stateNames(a.writes)
        const bWrites = stateNames(b.writes)
        const aReads = stateNames(a.reads)
        const bReads = stateNames(b.reads)
        const shared = new Set<string>()
        for (const name of aWrites) {
          if (bWrites.has(name) || bReads.has(name)) {
            shared.add(name)
          }
        }
        for (const name of bWrites) {
          if (aReads.has(name)) {
            shared.add(name)
          }
        }
        if (shared.size > 0) {
          report({
            code: 'schedule-conflict',
            message: `systems ${a.name} and ${b.name} both touch ${[...shared]
              .sort()
              .join(', ')} without an ordering constraint; add after/before or an event dependency`,
            rule: 'LG003',
          })
        }
      }
    }
  }

  return {
    pre: ordered.filter((def) => def.phase === 'pre'),
    update: ordered.filter((def) => def.phase === 'update'),
    post: ordered.filter((def) => def.phase === 'post'),
  }
}
