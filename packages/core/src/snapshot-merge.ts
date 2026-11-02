import type { EntityTableSnapshot } from './ecs/entity-store.js'
import { LuneGoError } from './errors.js'
import type { WorldSnapshot } from './snapshot.js'

function sameEntities(left: EntityTableSnapshot, right: EntityTableSnapshot): boolean {
  return (
    left.maxIndex === right.maxIndex &&
    left.generations.length === right.generations.length &&
    left.generations.every((value, index) => value === right.generations[index]) &&
    left.alive.length === right.alive.length &&
    left.alive.every((value, index) => value === right.alive[index]) &&
    left.free.length === right.free.length &&
    left.free.every((value, index) => value === right.free[index])
  )
}

/**
 * Combines the two persistence scopes into one loadable snapshot. Both files
 * must describe the same world at the same tick; the entity table is shared.
 */
export function mergeSnapshots(world: WorldSnapshot, profile: WorldSnapshot): WorldSnapshot {
  if (world.scope !== 'world' || profile.scope !== 'profile') {
    throw new LuneGoError(
      'snapshot_invalid',
      'mergeSnapshots expects a world snapshot and a profile snapshot',
      { rule: 'LG010' },
    )
  }
  if (
    world.formatVersion !== profile.formatVersion ||
    world.schemaVersion !== profile.schemaVersion ||
    world.tick !== profile.tick ||
    world.nextSeq !== profile.nextSeq ||
    world.dt !== profile.dt ||
    world.contentHash !== profile.contentHash ||
    JSON.stringify(world.states) !== JSON.stringify(profile.states)
  ) {
    throw new LuneGoError(
      'snapshot_mismatch',
      'world and profile snapshots were not taken from the same tick and configuration',
      { rule: 'LG010' },
    )
  }
  if (!sameEntities(world.entities, profile.entities)) {
    throw new LuneGoError(
      'snapshot_mismatch',
      'world and profile snapshots disagree about the entity table',
      { rule: 'LG010' },
    )
  }
  for (const name of Object.keys(profile.components)) {
    if (name in world.components) {
      throw new LuneGoError(
        'snapshot_mismatch',
        `component ${name} appears in both persistence scopes`,
        { rule: 'LG010' },
      )
    }
  }
  for (const name of Object.keys(profile.models)) {
    if (name in world.models) {
      throw new LuneGoError(
        'snapshot_mismatch',
        `model ${name} appears in both persistence scopes`,
        { rule: 'LG010' },
      )
    }
  }
  return {
    ...world,
    scope: 'combined',
    components: { ...world.components, ...profile.components },
    models: { ...world.models, ...profile.models },
    states: { ...world.states, ...profile.states },
  }
}

