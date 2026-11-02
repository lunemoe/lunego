import type { EntityTableSnapshot } from './ecs/entity-store.js'
import type { EntityStore } from './ecs/entity-store.js'
import { entityIndex } from './ecs/entity-store.js'
import { StateHasher, writeValue } from './hash.js'
import { t } from './schema.js'
import type { RngRegistry } from './rng.js'
import type { WorldCatalog } from './catalog.js'
import type { EmittedEvent } from './events.js'
import type { CommandEnvelope } from './world-types.js'
import { flowStateSnapshot } from './flow-state-registry.js'

export interface WorldHashInput {
  readonly catalog: WorldCatalog
  readonly entityStore: EntityStore
  readonly rng: RngRegistry
  readonly tick: number
  readonly schemaVersion: number
  readonly dt: number
  readonly contentHash: string
  readonly previousEvents: readonly EmittedEvent[]
  readonly pendingCommands: readonly CommandEnvelope[]
  readonly nextSeq: number
}

function hashEntityTable(hasher: StateHasher, table: EntityTableSnapshot): void {
  hasher.u32(table.maxIndex)
  const flags = new Uint8Array(table.maxIndex + 1)
  for (const entity of table.alive) {
    flags[entityIndex(entity)] = 1
  }
  for (const index of table.free) {
    flags[index] = flags[index] === 1 ? 3 : 2
  }
  for (let index = 1; index <= table.maxIndex; index += 1) {
    hasher.u16(table.generations[index])
    const flag = flags[index] ?? 0
    hasher.u8(flag === 1 || flag === 3 ? 1 : 0)
    hasher.u8(flag === 2 || flag === 3 ? 1 : 0)
  }
}

export function hashWorld(input: WorldHashInput): string {
  const { catalog, entityStore, rng } = input
  const hasher = new StateHasher()
  hasher.string('lunego-world')
  hasher.u32(input.schemaVersion)
  hasher.f32(input.dt)
  hasher.string(input.contentHash)
  hasher.safeInteger(input.tick)
  hasher.u32(input.nextSeq)
  hasher.u32(input.pendingCommands.length)
  for (const command of input.pendingCommands) {
    hasher.safeInteger(command.tick)
    hasher.u32(command.seq)
    hasher.safeInteger(command.sentAt)
    hasher.u8(typeof command.source === 'number' ? 0 : 1)
    hasher.string(String(command.source))
    hasher.string(command.type)
    hasher.string(JSON.stringify(command.payload))
  }
  const table = entityStore.snapshot()
  hashEntityTable(hasher, table)

  const storeNames = [...catalog.storesByName.keys()].sort()
  hasher.u32(storeNames.length)
  const entities = table.alive
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
        for (const field of store.hashFields) {
          writeValue(hasher, field.type, store.readField(field.name, index))
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

  const flowStates = flowStateSnapshot(catalog)
  const flowNames = Object.keys(flowStates).sort()
  hasher.u32(flowNames.length)
  for (const name of flowNames) {
    hasher.string(name)
    hasher.string(flowStates[name] ?? '')
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
