import { World, type ContentRegistry, type FeatureDef } from '@lunego/core'
import type { ReplayData, ReplayReport } from './types.js'

export interface ReplayOptions {
  readonly features: readonly FeatureDef[]
  readonly dt?: number
  readonly dev?: boolean
  readonly content?: ContentRegistry
}

function createReplayWorld(data: ReplayData, options: ReplayOptions): World {
  return World.fromSnapshot(data.snapshot, {
    features: options.features,
    schemaVersion: data.schemaVersion,
    ...(options.dt === undefined ? {} : { dt: options.dt }),
    ...(options.dev === undefined ? {} : { dev: options.dev }),
    ...(options.content === undefined ? {} : { content: options.content }),
  })
}

function hashAtTick(data: ReplayData, targetTick: number, options: ReplayOptions): string {
  const world = createReplayWorld(data, options)
  const sent = new Set<number>()
  while (world.tick < targetTick) {
    const nextTick = world.tick + 1
    for (let index = 0; index < data.commands.length; index += 1) {
      const command = data.commands[index]
      if (
        command === undefined ||
        sent.has(index) ||
        command.tick <= data.snapshot.tick ||
        command.sentAt >= nextTick
      ) {
        continue
      }
      sent.add(index)
      void world.send(command.type, command.payload, {
        tick: command.tick,
        source: command.source,
      }).catch(() => undefined)
    }
    world.step()
  }
  return world.hash()
}

function firstDivergence(data: ReplayData, options: ReplayOptions): number | null {
  if (data.hashes.length === 0) {
    return null
  }
  const sorted = [...data.hashes].sort((left, right) => left.tick - right.tick)
  let low = 0
  let high = sorted.length - 1
  let first = -1
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const entry = sorted[middle]
    const actual = hashAtTick(data, entry.tick, options)
    if (actual === entry.hash) {
      low = middle + 1
    } else {
      first = entry.tick
      high = middle - 1
    }
  }
  return first < 0 ? null : first
}

/**
 * Re-runs the recorded commands and checks both periodic checkpoints and the
 * per-tick hash log. The latter allows binary search for the first bad tick.
 */
export function verifyReplay(data: ReplayData, options: ReplayOptions): ReplayReport {
  let checkpointMismatch = false
  for (const checkpoint of data.checkpoints) {
    if (hashAtTick(data, checkpoint.tick, options) !== checkpoint.hash) {
      checkpointMismatch = true
      break
    }
  }
  const divergence = firstDivergence(data, options)
  return {
    ok: !checkpointMismatch && divergence === null,
    endTick: data.endTick,
    firstDivergenceTick: divergence,
    checkpointMismatch,
  }
}
