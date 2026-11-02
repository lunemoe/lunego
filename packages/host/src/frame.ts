import {
  cloneDeep,
  type Frame as CoreFrame,
  type ModelDef,
  type World,
} from '@lunego/core'
import type {
  CrashReport,
  GameFrame,
  ReplayHash,
  TimeGap,
  TimeGapDecision,
} from './types.js'

export function modelSnapshot(world: World, models: readonly ModelDef[]): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = {}
  for (const model of models) {
    result[model.name] = cloneDeep(world.model(model))
  }
  return result
}

export function resolveTimeGap(
  gap: number,
  maxCatchUp: number,
  tick: number,
  handler: ((value: TimeGap) => TimeGapDecision) | undefined,
): TimeGapDecision {
  return handler === undefined ? 'skip' : handler({ gap, maxCatchUp, tick })
}

export function buildGameFrame(
  world: World,
  models: readonly ModelDef[],
  dt: number,
  render: boolean,
  coreFrame: CoreFrame,
): GameFrame {
  return {
    tick: world.tick,
    dt,
    elapsed: world.tick * dt,
    render,
    events: coreFrame.events,
    cues: coreFrame.cues,
    modelPatches: coreFrame.modelPatches,
    models: modelSnapshot(world, models),
    entityCount: world.query().length,
    hash: world.hash(),
  }
}

export function toCrashReport(
  error: Error,
  world: World,
  hashes: readonly ReplayHash[],
): CrashReport {
  return {
    message: error.message,
    stack: error.stack ?? null,
    tick: world.tick,
    snapshot: world.snapshot(),
    commandLog: [...world.commandLog],
    hashes: [...hashes],
  }
}
