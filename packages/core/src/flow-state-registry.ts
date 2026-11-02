import type { FlowStateDef, StateDef } from './definitions.js'
import { registrationError } from './errors.js'

export interface FlowStateRuntime {
  readonly def: FlowStateDef
  current: string
}

export interface FlowStateCatalogView {
  readonly flowStates: ReadonlyMap<FlowStateDef, FlowStateRuntime>
  readonly stateByName: ReadonlyMap<string, StateDef>
}

export function flowStateRuntime(
  catalog: FlowStateCatalogView,
  def: FlowStateDef,
): FlowStateRuntime {
  const runtime = catalog.flowStates.get(def)
  if (runtime === undefined) {
    throw registrationError(`state ${def.name} is not registered`)
  }
  return runtime
}

export function flowStateSnapshot(
  catalog: FlowStateCatalogView,
): Readonly<Record<string, string>> {
  const states: Record<string, string> = {}
  for (const runtime of [...catalog.flowStates.values()].sort((left, right) =>
    left.def.name < right.def.name ? -1 : left.def.name > right.def.name ? 1 : 0,
  )) {
    states[runtime.def.name] = runtime.current
  }
  return states
}

export function restoreFlowStates(
  catalog: FlowStateCatalogView,
  states: Readonly<Record<string, string>>,
): void {
  const expected = new Set<string>()
  for (const runtime of catalog.flowStates.values()) {
    expected.add(runtime.def.name)
  }
  for (const name of Object.keys(states)) {
    if (!expected.has(name)) {
      throw registrationError(`snapshot references unknown state ${name}`, 'LG010')
    }
  }
  for (const name of expected) {
    if (!(name in states)) {
      throw registrationError(`snapshot is missing state ${name}`, 'LG010')
    }
    const def = catalog.stateByName.get(name)
    if (def === undefined || def.kind !== 'state') {
      throw registrationError(`snapshot state ${name} is not a flow state`, 'LG010')
    }
    const value = states[name]
    if (!def.values.includes(value)) {
      throw registrationError(`snapshot state ${name} has invalid value ${value}`, 'LG010')
    }
    flowStateRuntime(catalog, def).current = value
  }
}
