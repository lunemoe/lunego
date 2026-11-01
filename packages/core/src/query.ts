import type { QueryArg, QueryFilter } from './definitions.js'
import type { ComponentStore } from './ecs/component-store.js'
import { entityIndex, type EntityStore } from './ecs/entity-store.js'
import type { Entity } from './schema.js'
import type { WorldCatalog } from './catalog.js'

function isQueryFilter(arg: QueryArg): arg is QueryFilter {
  if (!('kind' in arg)) {
    return false
  }
  return arg.kind === 'without' || arg.kind === 'added' || arg.kind === 'removed'
}

function entityHas(entity: Entity, store: ComponentStore, entityStore: EntityStore): boolean {
  return entityStore.isAlive(entity) && store.has(entityIndex(entity))
}

export function queryEntities(
  catalog: WorldCatalog,
  entityStore: EntityStore,
  args: readonly QueryArg[],
): Entity[] {
  const required: ComponentStore[] = []
  const withoutStores: ComponentStore[] = []
  const addedStores: ComponentStore[] = []
  const removedStores: ComponentStore[] = []
  for (const arg of args) {
    if (isQueryFilter(arg)) {
      const stores = arg.defs.map((def) => catalog.storeForDef(def))
      if (arg.kind === 'without') {
        withoutStores.push(...stores)
      } else if (arg.kind === 'added') {
        addedStores.push(...stores)
      } else {
        removedStores.push(...stores)
      }
    } else {
      required.push(catalog.storeForDef(arg))
    }
  }

  let candidates: Set<Entity>
  if (removedStores.length > 0) {
    candidates = new Set(removedStores[0].removed)
    for (let index = 1; index < removedStores.length; index += 1) {
      const store = removedStores[index]
      for (const entity of candidates) {
        if (!store.removed.has(entity)) {
          candidates.delete(entity)
        }
      }
    }
  } else {
    candidates = new Set(entityStore.aliveEntities())
  }

  for (const store of addedStores) {
    for (const entity of candidates) {
      if (!store.added.has(entity)) {
        candidates.delete(entity)
      }
    }
  }
  for (const store of required) {
    for (const entity of candidates) {
      if (!entityHas(entity, store, entityStore)) {
        candidates.delete(entity)
      }
    }
  }
  for (const store of withoutStores) {
    for (const entity of candidates) {
      if (entityHas(entity, store, entityStore)) {
        candidates.delete(entity)
      }
    }
  }
  if (removedStores.length === 0) {
    for (const entity of candidates) {
      if (!entityStore.isAlive(entity)) {
        candidates.delete(entity)
      }
    }
  }
  return [...candidates].sort((left, right) => {
    const indexDelta = entityIndex(left) - entityIndex(right)
    return indexDelta !== 0 ? indexDelta : left - right
  })
}
