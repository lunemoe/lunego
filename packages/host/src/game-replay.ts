import type {
  ContentRegistry,
  FeatureDef,
  World,
  WorldSnapshot,
} from '@lunego/core'
import type { ReplayCheckpoint, ReplayData, ReplayHash, ReplayReport } from './types.js'
import { verifyReplay } from './replay.js'

export interface ExportReplayInput {
  readonly world: World
  readonly initialSnapshot: WorldSnapshot
  readonly schemaVersion: number
  readonly hashes: readonly ReplayHash[]
  readonly checkpoints: readonly ReplayCheckpoint[]
}

export function exportGameReplay(input: ExportReplayInput): ReplayData {
  const tick = input.world.tick
  const commands = [...input.world.commandLog]
  const hashes = [...input.hashes]
  const checkpoints = [...input.checkpoints]
  if (!checkpoints.some((entry) => entry.tick === tick)) {
    checkpoints.push({ tick, hash: input.world.hash() })
  }
  if (!hashes.some((entry) => entry.tick === tick)) {
    hashes.push({ tick, hash: input.world.hash() })
  }
  return {
    schemaVersion: input.schemaVersion,
    snapshot: input.initialSnapshot,
    commands,
    checkpoints,
    hashes,
    endTick: tick,
  }
}

export interface ReplayGameOptions {
  readonly features: readonly FeatureDef[]
  readonly dt: number
  readonly dev: boolean
  readonly content?: ContentRegistry
}

export function replayGame(data: ReplayData, options: ReplayGameOptions): ReplayReport {
  return verifyReplay(data, options)
}
