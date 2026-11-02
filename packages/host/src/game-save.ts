import {
  LuneGoError,
  World,
  mergeSnapshots,
  type RestoreOptions,
  type WorldSnapshot,
} from '@lunego/core'
import type {
  GameSave,
  ReplayCheckpoint,
  ReplayData,
  ReplayHash,
  ReplayReport,
} from './types.js'
import { exportGameReplay, replayGame, type ReplayGameOptions } from './game-replay.js'

export function snapshotGame(world: World): GameSave {
  return {
    world: world.snapshot('world'),
    profile: world.snapshot('profile'),
  }
}

export function restoreWorldSnapshot(
  snapshot: WorldSnapshot,
  options: RestoreOptions,
): World {
  try {
    return World.fromSnapshot(snapshot, options)
  } catch (error) {
    throw new LuneGoError('load_failed', 'failed to load snapshot', { cause: error })
  }
}

export function restoreGameSave(
  save: GameSave,
  options: RestoreOptions,
): { readonly world: World; readonly initialSnapshot: WorldSnapshot } {
  try {
    const world = World.fromSnapshots(
      { world: save.world, profile: save.profile },
      options,
    )
    return { world, initialSnapshot: mergeSnapshots(save.world, save.profile) }
  } catch (error) {
    throw new LuneGoError('load_failed', 'failed to load game save', { cause: error })
  }
}

export function exportSession(
  world: World,
  initialSnapshot: WorldSnapshot,
  schemaVersion: number,
  hashes: readonly ReplayHash[],
  checkpoints: readonly ReplayCheckpoint[],
): ReplayData {
  return exportGameReplay({ world, initialSnapshot, schemaVersion, hashes, checkpoints })
}

export function replaySession(data: ReplayData, options: ReplayGameOptions): ReplayReport {
  return replayGame(data, options)
}
