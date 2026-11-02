import type { EntityStore, EntityTableSnapshot } from './ecs/entity-store.js'
import { entityIndex } from './ecs/entity-store.js'
import type { Entity, PersistScope } from './schema.js'
import type { ComponentDef } from './definitions.js'
import { cloneDeep, coerceValue } from './schema-coerce.js'
import { coerceEventPayload } from './catalog-coercion.js'
import { flowStateSnapshot, restoreFlowStates } from './flow-state-registry.js'
import { t } from './schema.js'
import type { RngRegistry } from './rng.js'
import { LuneGoError } from './errors.js'
import type { WorldCatalog } from './catalog.js'
import type { EmittedEvent } from './events.js'
import type { CommandEnvelope } from './world-types.js'

export function assertSortedEntities(entities: readonly number[]): void {
  for (let index = 1; index < entities.length; index += 1) {
    if (entities[index] < entities[index - 1]) {
      throw new LuneGoError('snapshot_invalid', 'entity lists must be sorted')
    }
  }
}

export const SNAPSHOT_FORMAT_VERSION = 2

export type SnapshotScope = PersistScope | 'combined'

export interface SnapshotComponentEntry {
  readonly entity: Entity
  readonly value: Readonly<Record<string, unknown>>
}

export interface SnapshotComponentState {
  readonly entries: readonly SnapshotComponentEntry[]
  readonly added: readonly Entity[]
  readonly removed: readonly Entity[]
}

export interface SnapshotEvent {
  readonly type: string
  readonly payload: unknown
}

export interface SnapshotRng {
  readonly seed: number
  readonly streams: Readonly<Record<string, readonly number[]>>
}

export interface WorldSnapshot {
  readonly formatVersion: number
  readonly schemaVersion: number
  readonly scope: SnapshotScope
  readonly tick: number
  readonly nextSeq: number
  readonly dt: number
  readonly contentHash: string
  readonly pendingCommands: readonly CommandEnvelope[]
  readonly entities: EntityTableSnapshot
  readonly components: Readonly<Record<string, SnapshotComponentState>>
  readonly models: Readonly<Record<string, unknown>>
  readonly states: Readonly<Record<string, string>>
  readonly rng: SnapshotRng
  readonly previousEvents: readonly SnapshotEvent[]
}

export interface SnapshotInput {
  readonly catalog: WorldCatalog
  readonly entityStore: EntityStore
  readonly rng: RngRegistry
  readonly tick: number
  readonly nextSeq: number
  readonly schemaVersion: number
  readonly dt: number
  readonly contentHash: string
  readonly pendingCommands: readonly CommandEnvelope[]
  readonly previousEvents: readonly EmittedEvent[]
  readonly validate: boolean
}

export function snapshotWorld(input: SnapshotInput, scope: PersistScope): WorldSnapshot {
  if (scope !== 'world' && scope !== 'profile') {
    throw new LuneGoError('snapshot_invalid', `unknown persist scope ${String(scope)}`)
  }
  const { catalog, rng } = input
  const table = input.entityStore.snapshot()
  const components: Record<string, SnapshotComponentState> = {}
  for (const name of [...catalog.storesByName.keys()].sort()) {
    const stateDef = catalog.stateByName.get(name)
    const store = catalog.storesByName.get(name)
    if (stateDef === undefined || store === undefined || stateDef.kind === 'state') {
      continue
    }
    if (stateDef.options.persist !== scope) {
      continue
    }
    const entries: SnapshotComponentEntry[] = []
    for (const entity of table.alive) {
      const index = entityIndex(entity)
      if (store.has(index)) {
        const raw = store.read(index) ?? {}
        entries.push({
          entity,
          value: input.validate
            ? coerceValue(t.struct((stateDef as ComponentDef).schema), raw, `${name}.${entity}`)
            : cloneDeep(raw),
        })
      }
    }
    components[name] = {
      entries,
      added: [...store.added].sort((left, right) => left - right),
      removed: [...store.removed].sort((left, right) => left - right),
    }
  }

  const models: Record<string, unknown> = {}
  const runtimes = [...catalog.modelRuntimes.values()].sort((left, right) =>
    left.def.name < right.def.name ? -1 : left.def.name > right.def.name ? 1 : 0,
  )
  for (const runtime of runtimes) {
    if (runtime.def.options.persist === scope) {
      const raw = runtime.draft ?? runtime.committed
      models[runtime.def.name] = input.validate
        ? coerceValue(t.struct(runtime.def.schema), raw, runtime.def.name)
        : cloneDeep(raw)
    }
  }

  const rngStates = rng.states()
  const streams: Record<string, readonly number[]> = {}
  for (const name of Object.keys(rngStates).sort()) {
    streams[name] = [...rngStates[name]]
  }

  return {
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    schemaVersion: input.schemaVersion,
    scope,
    tick: input.tick,
    nextSeq: input.nextSeq,
    dt: input.dt,
    contentHash: input.contentHash,
    pendingCommands: input.pendingCommands.map((command) => ({
      tick: command.tick,
      seq: command.seq,
      source: command.source,
      type: command.type,
      payload: cloneDeep(command.payload),
    })),
    entities: {
      maxIndex: table.maxIndex,
      generations: [...table.generations],
      alive: [...table.alive],
      free: [...table.free],
    },
    components,
    models,
    states: flowStateSnapshot(catalog),
    rng: { seed: rng.seed, streams },
    previousEvents: input.previousEvents.map((event) => ({
      type: event.def.name,
      payload: cloneDeep(event.payload),
    })),
  }
}

export interface RestoreInput {
  readonly catalog: WorldCatalog
  readonly entityStore: EntityStore
  readonly rng: RngRegistry
  readonly snapshot: WorldSnapshot
  readonly schemaVersion: number
  readonly dt: number
  readonly contentHash: string
}

export interface RestoredState {
  readonly tick: number
  readonly nextSeq: number
  readonly pendingCommands: readonly CommandEnvelope[]
  readonly previousEvents: readonly EmittedEvent[]
}

export function restoreWorld(input: RestoreInput): RestoredState {
  const { catalog, entityStore, rng, snapshot } = input
  if (snapshot.formatVersion !== SNAPSHOT_FORMAT_VERSION) {
    throw new LuneGoError(
      'snapshot_invalid',
      `unsupported snapshot format ${snapshot.formatVersion}`,
      { rule: 'LG010' },
    )
  }
  if (snapshot.schemaVersion !== input.schemaVersion) {
    throw new LuneGoError(
      'schema_version_mismatch',
      `snapshot schema version ${snapshot.schemaVersion} does not match ${input.schemaVersion}`,
      { rule: 'LG010' },
    )
  }
  if (
    snapshot.scope !== 'world' &&
    snapshot.scope !== 'profile' &&
    snapshot.scope !== 'combined'
  ) {
    throw new LuneGoError('snapshot_invalid', 'unknown snapshot persist scope', {
      rule: 'LG010',
    })
  }
  if (!Number.isFinite(snapshot.dt) || snapshot.dt <= 0) {
    throw new LuneGoError('snapshot_invalid', 'snapshot dt must be positive', {
      rule: 'LG010',
    })
  }
  if (snapshot.dt !== input.dt) {
    throw new LuneGoError(
      'snapshot_dt_mismatch',
      `snapshot dt ${snapshot.dt} does not match world dt ${input.dt}`,
      { rule: 'LG010' },
    )
  }
  if (snapshot.contentHash !== input.contentHash) {
    throw new LuneGoError(
      'snapshot_content_mismatch',
      'snapshot content hash does not match the registered content pack',
      { rule: 'LG010' },
    )
  }
  if (!Number.isInteger(snapshot.tick) || snapshot.tick < 0) {
    throw new LuneGoError('snapshot_invalid', 'snapshot tick must be a non-negative integer')
  }
  if (!Number.isInteger(snapshot.nextSeq) || snapshot.nextSeq < 0) {
    throw new LuneGoError('snapshot_invalid', 'snapshot nextSeq must be a non-negative integer')
  }

  entityStore.restore(snapshot.entities)

  const scopes: readonly PersistScope[] =
    snapshot.scope === 'combined' ? ['world', 'profile'] : [snapshot.scope]
  const expectedComponents = new Set<string>()
  for (const [name, store] of catalog.storesByName) {
    const stateDef = catalog.stateByName.get(name)
    if (
      stateDef !== undefined &&
      stateDef.kind !== 'state' &&
      stateDef.options.persist !== null &&
      scopes.includes(stateDef.options.persist)
    ) {
      expectedComponents.add(name)
    }
    store.clearChanges()
  }
  for (const name of Object.keys(snapshot.components)) {
    if (!expectedComponents.has(name)) {
      throw new LuneGoError(
        'snapshot_invalid',
        `snapshot has component ${name} that is not persisted in scope ${snapshot.scope}`,
        { rule: 'LG010' },
      )
    }
  }
  for (const name of expectedComponents) {
    if (!(name in snapshot.components)) {
      throw new LuneGoError('snapshot_invalid', `snapshot is missing component ${name}`, {
        rule: 'LG010',
      })
    }
    const store = catalog.storesByName.get(name)
    const stateDef = catalog.stateByName.get(name)
    const componentState = snapshot.components[name]
    if (store === undefined || stateDef === undefined || componentState === undefined) {
      throw new LuneGoError('snapshot_invalid', `invalid component state ${name}`)
    }
    for (const entry of componentState.entries) {
      if (!entityStore.isAlive(entry.entity)) {
        throw new LuneGoError(
          'snapshot_invalid',
          `component ${name} references dead entity ${entry.entity}`,
          { rule: 'LG010' },
        )
      }
      const index = entityIndex(entry.entity)
      if (store.has(index)) {
        throw new LuneGoError(
          'snapshot_invalid',
          `duplicate component ${name} on entity ${entry.entity}`,
        )
      }
      if (stateDef.kind === 'state') {
        throw new LuneGoError('snapshot_invalid', `state ${name} is not a component`, {
          rule: 'LG010',
        })
      }
      const value =
        stateDef.kind === 'tag'
          ? {}
          : (coerceValue(t.struct(stateDef.schema), entry.value, name) as Record<string, unknown>)
      store.add(index, value)
    }
    assertSortedEntities(componentState.added)
    assertSortedEntities(componentState.removed)
    store.setChanges(componentState.added, componentState.removed)
  }

  const expectedModels = new Set<string>()
  for (const runtime of catalog.modelRuntimes.values()) {
    if (runtime.def.options.persist !== null && scopes.includes(runtime.def.options.persist)) {
      expectedModels.add(runtime.def.name)
      runtime.draft = null
    }
  }
  for (const name of Object.keys(snapshot.models)) {
    if (!expectedModels.has(name)) {
      throw new LuneGoError(
        'snapshot_invalid',
        `snapshot has model ${name} that is not persisted in scope ${snapshot.scope}`,
        { rule: 'LG010' },
      )
    }
  }
  for (const name of expectedModels) {
    if (!(name in snapshot.models)) {
      throw new LuneGoError('snapshot_invalid', `snapshot is missing model ${name}`, {
        rule: 'LG010',
      })
    }
    const runtime = [...catalog.modelRuntimes.values()].find(
      (candidate) => candidate.def.name === name,
    )
    if (runtime === undefined) {
      throw new LuneGoError('snapshot_invalid', `unknown model ${name}`)
    }
    runtime.committed = cloneDeep(
      coerceValue(t.struct(runtime.def.schema), snapshot.models[name], name),
    )
  }

  restoreFlowStates(catalog, snapshot.states)

  const previousEvents: EmittedEvent[] = []
  for (const event of snapshot.previousEvents) {
    const def = catalog.eventDefs.get(event.type)
    if (def === undefined) {
      throw new LuneGoError('snapshot_invalid', `snapshot references unknown event ${event.type}`, {
        rule: 'LG010',
      })
    }
    previousEvents.push({
      def,
      payload: coerceEventPayload(def, event.payload),
    })
  }

  rng.restore(snapshot.rng.seed, snapshot.rng.streams)
  return {
    tick: snapshot.tick,
    nextSeq: snapshot.nextSeq,
    pendingCommands: snapshot.pendingCommands,
    previousEvents,
  }
}
