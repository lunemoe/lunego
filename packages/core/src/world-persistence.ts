import type { WorldCatalog } from './catalog.js'
import type { CommandQueue } from './commands.js'
import type { EntityStore } from './ecs/entity-store.js'
import type { EventState } from './event-state.js'
import type { PersistScope } from './schema.js'
import type { RngRegistry } from './rng.js'
import type { Diagnostic } from './scheduler.js'
import type { StructuralQueue } from './structural.js'
import type { WorldSnapshot } from './snapshot.js'
import { hashWorld } from './world-hash.js'
import { restoreWorld, snapshotWorld } from './snapshot.js'

export interface WorldPersistenceSource {
  readonly catalog: WorldCatalog
  readonly entityStore: EntityStore
  readonly rng: RngRegistry
  readonly commands: CommandQueue
  readonly structural: StructuralQueue
  readonly eventState: EventState
  readonly contentHash: string
  readonly schemaVersion: number
  readonly dt: number
  get tick(): number
  set tick(value: number)
  get failure(): Error | null
  set failure(value: Error | null)
  resetQueryDepth(): void
  report(diagnostic: Diagnostic): void
  hasWarned(name: string): boolean
  markWarned(name: string): void
}

export function warnEphemeralStates(source: WorldPersistenceSource): void {
  const names: string[] = []
  for (const def of source.catalog.stateByName.values()) {
    if (def.kind !== 'state' && def.options.persist === null) {
      names.push(def.name)
    }
  }
  for (const runtime of source.catalog.modelRuntimes.values()) {
    if (runtime.def.options.persist === null) {
      names.push(runtime.def.name)
    }
  }
  for (const name of names) {
    if (source.hasWarned(name)) {
      continue
    }
    source.markWarned(name)
    source.report({
      code: 'snapshot-ephemeral',
      message: `state ${name} has persist:null; a snapshot will not restore it`,
      rule: 'LG010',
    })
  }
}

export function worldHash(source: WorldPersistenceSource): string {
  return hashWorld({
    catalog: source.catalog,
    entityStore: source.entityStore,
    rng: source.rng,
    tick: source.tick,
    schemaVersion: source.schemaVersion,
    dt: source.dt,
    contentHash: source.contentHash,
    previousEvents: source.eventState.previousList,
  })
}

export function worldSnapshot(
  source: WorldPersistenceSource,
  scope: PersistScope,
  validate: boolean,
): WorldSnapshot {
  return snapshotWorld(
    {
      catalog: source.catalog,
      entityStore: source.entityStore,
      rng: source.rng,
      tick: source.tick,
      nextSeq: source.commands.nextSeq,
      schemaVersion: source.schemaVersion,
      dt: source.dt,
      contentHash: source.contentHash,
      pendingCommands: source.commands.pendingEnvelopes(),
      previousEvents: source.eventState.previousList,
      validate,
    },
    scope,
  )
}

export function restoreIntoWorld(
  source: WorldPersistenceSource,
  snapshot: WorldSnapshot,
): void {
  const restored = restoreWorld({
    catalog: source.catalog,
    entityStore: source.entityStore,
    rng: source.rng,
    snapshot,
    schemaVersion: source.schemaVersion,
    dt: source.dt,
    contentHash: source.contentHash,
  })
  source.tick = restored.tick
  source.commands.clear()
  source.commands.restoreSequence(restored.nextSeq)
  source.commands.restorePending(restored.pendingCommands)
  source.structural.clear()
  source.eventState.restore(restored.previousEvents, snapshot.tick)
  source.resetQueryDepth()
  source.failure = null
}
