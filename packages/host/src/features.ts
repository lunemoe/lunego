import type { ComponentDef, FeatureDef, ModelDef } from '@lunego/core'

export function collectFeatures(roots: readonly FeatureDef[]): FeatureDef[] {
  const seen = new Set<FeatureDef>()
  const result: FeatureDef[] = []
  const visit = (feature: FeatureDef): void => {
    if (seen.has(feature)) {
      return
    }
    seen.add(feature)
    for (const dependency of feature.deps) {
      visit(dependency)
    }
    result.push(feature)
  }
  for (const root of roots) {
    visit(root)
  }
  return result
}

export function uniqueModels(features: readonly FeatureDef[]): ModelDef[] {
  const byName = new Map<string, ModelDef>()
  for (const feature of features) {
    for (const model of feature.schema.models) {
      byName.set(model.name, model)
    }
  }
  return [...byName.values()]
}

export function interpolatedComponents(features: readonly FeatureDef[]): ComponentDef[] {
  const byName = new Map<string, ComponentDef>()
  for (const feature of features) {
    for (const component of feature.schema.components) {
      if (component.options.interpolate) {
        byName.set(component.name, component)
      }
    }
  }
  return [...byName.values()]
}
