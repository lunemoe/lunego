import type {
  CommandSource,
  FeatureDef,
  WorldSnapshot,
} from '@lunego/core'
import { TestWorld, type TestWorldOptions } from './test-world.js'

export interface ReplayCommand {
  readonly tick: number
  readonly type: string
  readonly payload: unknown
  readonly source?: CommandSource
  /** Tick when the command was sent; defaults to tick - 1. */
  readonly sentAt?: number
}

export interface ReplayCheckpoint {
  readonly tick: number
  readonly hash: string
}

export interface ReplayLog {
  readonly endTick: number
  readonly commands: readonly ReplayCommand[]
  readonly checkpoints?: readonly ReplayCheckpoint[]
  readonly seed?: number
  readonly schemaVersion?: number
  readonly snapshot?: WorldSnapshot
}

export interface ReplayOptions {
  readonly features: readonly FeatureDef[]
  readonly dev?: boolean
  readonly dt?: number
}

export interface ReplayResult {
  readonly world: TestWorld
  readonly hashes: ReadonlyMap<number, string>
}

/**
 * Golden replay: starts from a seed or snapshot, re-sends the command log at
 * its recorded ticks, and checks every supplied checkpoint hash.
 */
export function verifyReplay(log: ReplayLog, options: ReplayOptions): ReplayResult {
  if (!Number.isInteger(log.endTick) || log.endTick < 0) {
    throw new Error('replay endTick must be a non-negative integer')
  }
  let world: TestWorld
  if (log.snapshot !== undefined) {
    world = TestWorld.fromSnapshot(log.snapshot, {
      features: options.features,
      schemaVersion: log.schemaVersion ?? log.snapshot.schemaVersion,
      ...(options.dev === undefined ? {} : { dev: options.dev }),
      ...(options.dt === undefined ? {} : { dt: options.dt }),
    })
  } else {
    const worldOptions: TestWorldOptions = {
      features: options.features,
      seed: log.seed ?? 1,
      schemaVersion: log.schemaVersion ?? 1,
      ...(options.dev === undefined ? {} : { dev: options.dev }),
      ...(options.dt === undefined ? {} : { dt: options.dt }),
    }
    world = new TestWorld(worldOptions)
  }

  const startTick = world.tick
  for (const command of log.commands) {
    if (command.tick <= startTick) {
      throw new Error(
        `replay command ${command.type} targets tick ${command.tick}, at or before start ${startTick}`,
      )
    }
    if (command.tick > log.endTick) {
      throw new Error(
        `replay command ${command.type} targets tick ${command.tick}, after end ${log.endTick}`,
      )
    }
  }

  const hashes = new Map<number, string>()
  hashes.set(startTick, world.hash())
  const sent = new Set<ReplayCommand>()
  for (let tick = startTick + 1; tick <= log.endTick; tick += 1) {
    for (const command of log.commands) {
      if (sent.has(command) || (command.sentAt ?? command.tick - 1) >= tick) {
        continue
      }
      sent.add(command)
      void world.send(command.type, command.payload, {
        tick: command.tick,
        ...(command.source === undefined ? {} : { source: command.source }),
      })
    }
    world.step()
    hashes.set(tick, world.hash())
  }

  for (const checkpoint of log.checkpoints ?? []) {
    const hash = hashes.get(checkpoint.tick)
    if (hash === undefined) {
      throw new Error(`replay has no hash for checkpoint tick ${checkpoint.tick}`)
    }
    if (hash !== checkpoint.hash) {
      throw new Error(
        `replay checkpoint mismatch at tick ${checkpoint.tick}: expected ${checkpoint.hash}, got ${hash}`,
      )
    }
  }
  return { world, hashes }
}
