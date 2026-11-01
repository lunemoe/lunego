import type { EntityTableSnapshot } from './ecs/entity-store.js'
import type { EntityStore } from './ecs/entity-store.js'
import { entityIndex } from './ecs/entity-store.js'
import { StateHasher, writeValue } from './hash.js'
import { t } from './schema.js'
import type { Entity } from './schema.js'
import type { RngRegistry } from './rng.js'
import type { WorldCatalog } from './catalog.js'
import type { EmittedEvent } from './events.js'

export interface WorldHashInput {
  readonly catalog: WorldCatalog
  readonly entityStore: EntityStore
  readonly rng: RngRegistry
  readonly tick: number
  readonly schemaVersion: number
  readonly previousEvents: readonly EmittedEvent[]
}

function hashEntityTable(hasher: StateHasher, table: EntityTableSnapshot): void {
  hasher.u32(table.maxIndex)
  const aliveByIndex = new Map<number, Entity>()
  for (const entity of table.alive) {
    aliveByIndex.set(entityIndex(entity), entity)
  }
  const free = new Set<number>(table.free)
  for (let index = 1; index <= table.maxIndex; index += 1) {
    hasher.u16(table.generations[index])
    hasher.u8(aliveByIndex.has(index) ? 1 : 0)
    hasher.u8(free.has(index) ? 1 : 0)
  }
}

export function hashWorld(input: WorldHashInput): string {
  const { catalog, entityStore, rng } = input
  const hasher = new StateHasher()
  hasher.string('lunego-world')
  hasher.u32(input.schemaVersion)
  hasher.safeInteger(input.tick)
  const table = entityStore.snapshot()
  hashEntityTable(hasher, table)

  const storeNames = [...catalog.storesByName.keys()].sort()
  hasher.u32(storeNames.length)
  const entities = [...table.alive].sort(
    (left, right) => entityIndex(left) - entityIndex(right),
  )
  for (const name of storeNames) {
    const store = catalog.storesByName.get(name)
    if (store === undefined) {
      continue
    }
    hasher.string(name)
    for (const entity of entities) {
      const index = entityIndex(entity)
      if (store.has(index)) {
        hasher.u8(1)
        for (const field of Object.keys(store.def.schema)) {
          writeValue(hasher, store.def.schema[field], store.readField(field, index))
        }
      } else {
        hasher.u8(0)
      }
    }
    const added = [...store.added].sort((left, right) => left - right)
    const removed = [...store.removed].sort((left, right) => left - right)
    hasher.u32(added.length)
    for (const entity of added) {
      hasher.u32(entity)
    }
    hasher.u32(removed.length)
    for (const entity of removed) {
      hasher.u32(entity)
    }
  }

  const models = [...catalog.modelRuntimes.values()].sort((left, right) =>
    left.def.name < right.def.name ? -1 : left.def.name > right.def.name ? 1 : 0,
  )
  hasher.u32(models.length)
  for (const runtime of models) {
    hasher.string(runtime.def.name)
    writeValue(hasher, t.struct(runtime.def.schema), runtime.draft ?? runtime.committed)
  }

  const rngStates = rng.states()
  const streamNames = Object.keys(rngStates).sort()
  hasher.u32(streamNames.length)
  for (const name of streamNames) {
    hasher.string(name)
    const words = rngStates[name]
    hasher.u32(words[0])
    hasher.u32(words[1])
    hasher.u32(words[2])
    hasher.u32(words[3])
  }

  hasher.u32(input.previousEvents.length)
  for (const event of input.previousEvents) {
    hasher.string(event.def.name)
    if (event.def.schema !== null) {
      writeValue(hasher, t.struct(event.def.schema), event.payload)
    }
  }
  return hasher.hex()
}
