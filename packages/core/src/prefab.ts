import { LuneGoError } from './errors.js'

export type PrefabComponents = Readonly<Record<string, unknown>>

export interface Prefab<C extends PrefabComponents = PrefabComponents> {
  readonly kind: 'prefab'
  readonly name: string
  readonly components: C
}

/** Declares an entity template; spawning merges component-level overrides. */
export function definePrefab<const C extends PrefabComponents>(
  name: string,
  components: C,
): Prefab<C> {
  if (name.length === 0 || name.trim() !== name) {
    throw new LuneGoError('definition_invalid', 'prefab name must not be empty')
  }
  if (Object.keys(components).length === 0) {
    throw new LuneGoError('definition_invalid', `prefab ${name} must define at least one component`)
  }
  return { kind: 'prefab', name, components }
}

export function isPrefab(value: unknown): value is Prefab {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'prefab'
  )
}

function mergeComponent(base: unknown, override: unknown): unknown {
  if (
    typeof base === 'object' &&
    base !== null &&
    !Array.isArray(base) &&
    typeof override === 'object' &&
    override !== null &&
    !Array.isArray(override)
  ) {
    return { ...base, ...override }
  }
  return override
}

/** Merge prefab components with overrides; overrides are validated on spawn. */
export function prefabComponents(
  prefab: Prefab,
  overrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = {}
  for (const name of Object.keys(prefab.components)) {
    result[name] = Object.hasOwn(overrides, name)
      ? mergeComponent(prefab.components[name], overrides[name])
      : prefab.components[name]
  }
  for (const name of Object.keys(overrides)) {
    if (!(name in result)) {
      result[name] = overrides[name]
    }
  }
  return result
}
