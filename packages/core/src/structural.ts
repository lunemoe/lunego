import type { ComponentDef, TagDef } from './definitions.js'
import { LuneGoError, registrationError } from './errors.js'
import type { ComponentStore } from './ecs/component-store.js'
import { entityIndex, type EntityStore } from './ecs/entity-store.js'
import type { Entity } from './schema.js'
import type { WorldCatalog } from './catalog.js'

interface PendingComponent {
  readonly store: ComponentStore
  readonly value: Record<string, unknown>
}

type StructuralOp =
  | {
      readonly kind: 'spawn'
      readonly entity: Entity
      readonly components: readonly PendingComponent[]
    }
  | { readonly kind: 'despawn'; readonly entity: Entity }
  | {
      readonly kind: 'add'
      readonly entity: Entity
      readonly store: ComponentStore
      readonly value: Record<string, unknown>
    }
  | { readonly kind: 'remove'; readonly entity: Entity; readonly store: ComponentStore }

/**
 * All structural writes are queued and applied in the flush phase. Spawns
 * reserve an entity id immediately, but the entity is not queryable until the
 * flush activates it.
 */
export class StructuralQueue {
  private readonly catalog: WorldCatalog
  private readonly entityStore: EntityStore
  private readonly ops: StructuralOp[] = []
  private readonly pendingSpawns = new Set<Entity>()

  constructor(catalog: WorldCatalog, entityStore: EntityStore) {
    this.catalog = catalog
    this.entityStore = entityStore
  }

  spawn(components: Readonly<Record<string, unknown>>, assertWrite: (name: string) => void): Entity {
    const pending: PendingComponent[] = []
    for (const name of Object.keys(components).sort()) {
      const stateDef = this.catalog.getStateDef(name)
      if (stateDef === undefined || stateDef.kind === 'model') {
        throw registrationError(`unknown component ${name}`)
      }
      assertWrite(name)
      const store = this.catalog.storeByName(name)
      if (store === undefined) {
        throw registrationError(`component ${name} has no store`)
      }
      pending.push({
        store,
        value: this.catalog.coerceComponentValue(stateDef, components[name]),
      })
    }
    const entity = this.entityStore.allocate()
    this.pendingSpawns.add(entity)
    this.ops.push({ kind: 'spawn', entity, components: pending })
    return entity
  }

  add(entity: Entity, target: ComponentDef | TagDef, value: unknown): void {
    if (!this.entityStore.isAlive(entity) && !this.pendingSpawns.has(entity)) {
      throw new LuneGoError('stale_entity', `cannot add to dead entity ${entity}`, {
        rule: 'LG004',
      })
    }
    this.ops.push({
      kind: 'add',
      entity,
      store: this.catalog.storeForDef(target),
      value: this.catalog.coerceComponentValue(target, value),
    })
  }

  remove(entity: Entity, target: ComponentDef | TagDef): void {
    if (!this.entityStore.isAlive(entity) && !this.pendingSpawns.has(entity)) {
      throw new LuneGoError('stale_entity', `cannot remove from dead entity ${entity}`, {
        rule: 'LG004',
      })
    }
    this.ops.push({
      kind: 'remove',
      entity,
      store: this.catalog.storeForDef(target),
    })
  }

  despawn(entity: Entity, assertWrite: (name: string) => void): void {
    const alive = this.entityStore.isAlive(entity)
    if (!alive && !this.pendingSpawns.has(entity)) {
      throw new LuneGoError('stale_entity', `cannot despawn dead entity ${entity}`, {
        rule: 'LG004',
      })
    }
    if (alive) {
      const index = entityIndex(entity)
      for (const store of this.catalog.storesByName.values()) {
        if (store.has(index)) {
          assertWrite(store.def.name)
        }
      }
    }
    for (const op of this.ops) {
      if (op.kind === 'spawn' && op.entity === entity) {
        for (const component of op.components) {
          assertWrite(component.store.def.name)
        }
      }
    }
    this.ops.push({ kind: 'despawn', entity })
  }

  flush(clearChanges: boolean): void {
    if (clearChanges) {
      for (const store of this.catalog.storesByName.values()) {
        store.clearChanges()
      }
    }
    const ops = this.ops.splice(0, this.ops.length)
    for (const op of ops) {
      if (op.kind === 'spawn') {
        this.entityStore.activate(op.entity)
        const index = entityIndex(op.entity)
        for (const component of op.components) {
          if (component.store.has(index)) {
            throw new LuneGoError(
              'component_exists',
              `entity ${op.entity} already has ${component.store.def.name}`,
            )
          }
          component.store.add(index, component.value)
          component.store.added.add(op.entity)
        }
        this.pendingSpawns.delete(op.entity)
      } else if (op.kind === 'despawn') {
        this.entityStore.assertAlive(op.entity)
        const index = entityIndex(op.entity)
        for (const store of this.catalog.storesByName.values()) {
          if (store.has(index)) {
            store.remove(index)
            store.removed.add(op.entity)
          }
        }
        this.entityStore.release(op.entity)
      } else if (op.kind === 'add') {
        this.entityStore.assertAlive(op.entity)
        const index = entityIndex(op.entity)
        if (op.store.has(index)) {
          throw new LuneGoError(
            'component_exists',
            `entity ${op.entity} already has ${op.store.def.name}`,
          )
        }
        op.store.add(index, op.value)
        op.store.added.add(op.entity)
      } else {
        this.entityStore.assertAlive(op.entity)
        const index = entityIndex(op.entity)
        if (!op.store.has(index)) {
          throw new LuneGoError(
            'component_missing',
            `entity ${op.entity} has no ${op.store.def.name}`,
          )
        }
        op.store.remove(index)
        op.store.removed.add(op.entity)
      }
    }
    this.pendingSpawns.clear()
  }

  clear(): void {
    this.ops.length = 0
    this.pendingSpawns.clear()
  }

  get pendingSpawnCount(): number {
    return this.pendingSpawns.size
  }
}
