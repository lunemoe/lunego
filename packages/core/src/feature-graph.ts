import type { FeatureDef } from './features.js'
import { registrationError } from './errors.js'

export function collectFeatures(roots: readonly FeatureDef[]): FeatureDef[] {
  const ordered: FeatureDef[] = []
  const byName = new Map<string, FeatureDef>()
  const visiting = new Set<FeatureDef>()
  const done = new Set<FeatureDef>()

  const visit = (feature: FeatureDef): void => {
    if (done.has(feature)) {
      return
    }
    if (visiting.has(feature)) {
      throw registrationError(`feature dependency cycle at ${feature.name}`)
    }
    const existing = byName.get(feature.name)
    if (existing !== undefined && existing !== feature) {
      throw registrationError(`duplicate feature name ${feature.name}`)
    }
    byName.set(feature.name, feature)
    visiting.add(feature)
    for (const dependency of feature.deps) {
      visit(dependency)
    }
    visiting.delete(feature)
    done.add(feature)
    ordered.push(feature)
  }

  for (const root of roots) {
    visit(root)
  }
  return ordered
}
