import type { ContextDeclarations } from './context-declarations.js'
import type {
  CommandDef,
  FlowStateDef,
  StateDef,
  StateHookDef,
  SystemDef,
} from './definitions.js'
import { registrationError } from './errors.js'
import type { HandlerBinding, SystemBinding } from './catalog-types.js'

export interface CatalogValidationView {
  readonly stateByName: ReadonlyMap<string, StateDef>
  readonly stateOwners: ReadonlyMap<StateDef, string>
  readonly featureNames: ReadonlySet<string>
  readonly allowedWriters: Map<StateDef, ReadonlySet<string>>
  readonly systemBindings: ReadonlyMap<SystemDef, SystemBinding>
  readonly handlerBindings: ReadonlyMap<string, HandlerBinding>
  readonly stateHookBindings: ReadonlyMap<
    StateHookDef,
    { declarations: ContextDeclarations; feature: string }
  >
  readonly commands: ReadonlyMap<string, CommandDef>
  readonly flowStates: ReadonlyMap<FlowStateDef, unknown>
}

export function validateStateDefs(
  catalog: CatalogValidationView,
  defs: readonly StateDef[],
  context: string,
): void {
  for (const def of defs) {
    if (catalog.stateByName.get(def.name) !== def) {
      throw registrationError(`${context} references unregistered state ${def.name}`)
    }
  }
}

export function validateWriters(catalog: CatalogValidationView): void {
  for (const def of catalog.stateByName.values()) {
    const owner = catalog.stateOwners.get(def)
    if (owner === undefined) {
      throw registrationError(`state ${def.name} has no owner feature`)
    }
    const allowed = new Set<string>([owner])
    for (const writer of def.options.writers) {
      if (!catalog.featureNames.has(writer)) {
        throw registrationError(
          `state ${def.name} declares unknown writer feature ${writer}`,
          'LG005',
        )
      }
      allowed.add(writer)
    }
    catalog.allowedWriters.set(def, allowed)
  }
}

export function validateWriteOwnership(catalog: CatalogValidationView): void {
  const check = (feature: string, writes: readonly StateDef[]): void => {
    for (const def of writes) {
      const allowed = catalog.allowedWriters.get(def)
      if (allowed === undefined) {
        throw registrationError(`state ${def.name} has no writer set`)
      }
      if (!allowed.has(feature)) {
        throw registrationError(
          `feature ${feature} writes ${def.name}, which belongs to another feature; add it to writers`,
          'LG005',
        )
      }
    }
  }
  for (const binding of catalog.systemBindings.values()) {
    check(binding.feature, binding.def.writes)
  }
  for (const binding of catalog.handlerBindings.values()) {
    check(binding.feature, binding.def.writes)
  }
  for (const [hook, binding] of catalog.stateHookBindings) {
    check(binding.feature, hook.writes)
  }
}

export function validateCommandsHandled(catalog: CatalogValidationView): void {
  for (const type of catalog.commands.keys()) {
    if (!catalog.handlerBindings.has(type)) {
      throw registrationError(`command ${type} has no handler`)
    }
  }
}
