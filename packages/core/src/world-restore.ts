import { ContentRegistry } from './content.js'
import { LuneGoError } from './errors.js'
import type { WorldSnapshot } from './snapshot.js'
import { mergeSnapshots } from './snapshot-merge.js'
import { worldInternals } from './world-internals.js'
import type { RestoreOptions, WorldOptions } from './world-options.js'

type WorldFactory<W> = (options: WorldOptions) => W

export function worldFromSnapshot<W extends object>(
  snapshot: WorldSnapshot,
  options: RestoreOptions,
  create: WorldFactory<W>,
): W {
  if (options.dt !== undefined && options.dt !== snapshot.dt) {
    throw new LuneGoError(
      'snapshot_dt_mismatch',
      `restore dt ${options.dt} does not match snapshot dt ${snapshot.dt}`,
      { rule: 'LG010' },
    )
  }
  const content = options.content ?? new ContentRegistry()
  if (content.fingerprint() !== snapshot.contentHash) {
    throw new LuneGoError(
      'snapshot_content_mismatch',
      'snapshot content hash does not match the restored content pack',
      { rule: 'LG010' },
    )
  }
  const world = create({
    features: options.features,
    seed: snapshot.rng.seed,
    schemaVersion: options.schemaVersion,
    dt: snapshot.dt,
    dev: options.dev ?? true,
    content,
    ...(options.onDiagnostic === undefined ? {} : { onDiagnostic: options.onDiagnostic }),
    ...(options.onLog === undefined ? {} : { onLog: options.onLog }),
  })
  worldInternals(world).restore(snapshot)
  return world
}

export function worldFromSnapshots<W extends object>(
  snapshots: { readonly world: WorldSnapshot; readonly profile: WorldSnapshot },
  options: RestoreOptions,
  create: WorldFactory<W>,
): W {
  return worldFromSnapshot(mergeSnapshots(snapshots.world, snapshots.profile), options, create)
}
