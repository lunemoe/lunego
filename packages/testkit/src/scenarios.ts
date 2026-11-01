import type { FeatureDef, Frame, WorldSnapshot } from '@lunego/core'
import { TestWorld, type TestWorldOptions } from './test-world.js'

export interface Scenario {
  readonly features: readonly FeatureDef[]
  readonly ticks: number
  readonly seed?: number
  readonly schemaVersion?: number
  readonly dt?: number
  readonly dev?: boolean
  readonly onTick?: (world: TestWorld, tick: number) => void
}

export interface ScenarioRun {
  readonly world: TestWorld
  readonly hashes: readonly string[]
  readonly frames: readonly Frame[]
  readonly hash: string
}

export interface TransparencyResult {
  readonly full: ScenarioRun
  readonly resumedHashes: readonly string[]
  readonly boundaryHash: string
  readonly restoredHash: string
}

function optionsFor(scenario: Scenario): TestWorldOptions {
  return {
    features: scenario.features,
    ...(scenario.seed === undefined ? {} : { seed: scenario.seed }),
    ...(scenario.schemaVersion === undefined
      ? {}
      : { schemaVersion: scenario.schemaVersion }),
    ...(scenario.dt === undefined ? {} : { dt: scenario.dt }),
    ...(scenario.dev === undefined ? {} : { dev: scenario.dev }),
  }
}

function assertTickCount(ticks: number): void {
  if (!Number.isInteger(ticks) || ticks < 0) {
    throw new Error('scenario ticks must be a non-negative integer')
  }
}

export function runScenario(scenario: Scenario): ScenarioRun {
  assertTickCount(scenario.ticks)
  const world = new TestWorld(optionsFor(scenario))
  const hashes: string[] = []
  const frames: Frame[] = []
  for (let index = 0; index < scenario.ticks; index += 1) {
    scenario.onTick?.(world, world.tick + 1)
    world.step()
    hashes.push(world.hash())
    frames.push(world.frame)
  }
  return {
    world,
    hashes,
    frames,
    hash: world.hash(),
  }
}

/**
 * Runs a scenario twice from scratch and compares the per-tick state hashes.
 * Any nondeterminism shows up at the first divergent tick.
 */
export function assertDeterministic(scenario: Scenario): ScenarioRun {
  const first = runScenario(scenario)
  const second = runScenario(scenario)
  if (first.hashes.length !== second.hashes.length) {
    throw new Error('determinism check produced different tick counts')
  }
  for (let index = 0; index < first.hashes.length; index += 1) {
    if (first.hashes[index] !== second.hashes[index]) {
      throw new Error(
        `nondeterministic scenario at tick ${index + 1}: ${first.hashes[index]} !== ${second.hashes[index]}`,
      )
    }
  }
  if (first.hash !== second.hash) {
    throw new Error(`nondeterministic final hash: ${first.hash} !== ${second.hash}`)
  }
  return first
}

/**
 * Verifies that save/load is transparent: run N ticks, and compare against
 * N/2 ticks + JSON snapshot + restore + N/2 ticks.
 */
export function assertSaveLoadTransparent(scenario: Scenario): TransparencyResult {
  assertTickCount(scenario.ticks)
  const full = runScenario(scenario)
  const half = Math.floor(scenario.ticks / 2)
  const split = new TestWorld(optionsFor(scenario))
  for (let index = 0; index < half; index += 1) {
    scenario.onTick?.(split, split.tick + 1)
    split.step()
  }
  const boundaryHash = split.hash()
  const snapshot = split.snapshot()
  const json = JSON.parse(JSON.stringify(snapshot)) as WorldSnapshot
  const restored = TestWorld.fromSnapshot(json, {
    features: scenario.features,
    schemaVersion: scenario.schemaVersion ?? 1,
    ...(scenario.dt === undefined ? {} : { dt: scenario.dt }),
    ...(scenario.dev === undefined ? {} : { dev: scenario.dev }),
  })
  const restoredHash = restored.hash()
  if (restoredHash !== boundaryHash) {
    throw new Error(
      `restore changed state at tick ${half}: ${boundaryHash} !== ${restoredHash}`,
    )
  }
  const resumedHashes: string[] = []
  for (let index = half; index < scenario.ticks; index += 1) {
    scenario.onTick?.(restored, restored.tick + 1)
    restored.step()
    resumedHashes.push(restored.hash())
  }
  const expected = full.hashes.slice(half)
  for (let index = 0; index < expected.length; index += 1) {
    if (resumedHashes[index] !== expected[index]) {
      throw new Error(
        `save/load diverged at tick ${half + index + 1}: ${expected[index]} !== ${resumedHashes[index]}`,
      )
    }
  }
  return { full, resumedHashes, boundaryHash, restoredHash }
}
