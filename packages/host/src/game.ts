import {
  LuneGoError,
  World,
  type CommandDef,
  type CommandOutcome,
  type CommandPayload,
  type ComponentDef,
  type ContentRegistry,
  type Entity,
  type FeatureDef,
  type ModelDef,
  type QueryDef,
  type RestoreOptions,
  type SendOptions,
  type WorldSnapshot,
} from '@lunego/core'
import { worldInternals } from '@lunego/core/internal'
import type {
  CrashReport,
  GameFrame,
  GameOptions,
  GameSave,
  HostMode,
  ReplayCheckpoint,
  ReplayData,
  ReplayHash,
  ReplayReport,
  RenderSource,
  TimeMode,
} from './types.js'
import {
  exportSession,
  replaySession,
  restoreGameSave,
  restoreWorldSnapshot,
  snapshotGame,
} from './game-save.js'
import { collectFeatures, interpolatedComponents, uniqueModels } from './features.js'
import { buildGameFrame, resolveTimeGap, toCrashReport } from './frame.js'
import { capturePreviousValues, createRenderSource } from './view-source.js'

export class Game {
  readonly mode: HostMode
  readonly timeMode: TimeMode
  readonly features: readonly FeatureDef[]
  private readonly schemaVersion: number
  private readonly dt: number
  private readonly dev: boolean
  private readonly content: ContentRegistry | undefined
  private readonly onDiagnostic: GameOptions['onDiagnostic']
  private readonly onFrame: GameOptions['onFrame']
  private readonly onError: GameOptions['onError']
  private readonly onTimeGap: GameOptions['onTimeGap']
  private readonly maxCatchUp: number
  private readonly maxTicksPerUpdate: number
  private readonly checkpointInterval: number
  private readonly modelDefs: readonly ModelDef[]
  private readonly interpolated: readonly ComponentDef[]
  private readonly previousValues = new Map<string, ReadonlyMap<Entity, unknown>>()
  private readonly frameListeners = new Set<(frame: GameFrame) => void>()
  private readonly hashLog: ReplayHash[] = []
  private readonly checkpoints: ReplayCheckpoint[] = []
  private viewSource: RenderSource
  private worldValue: World
  private initialSnapshot: WorldSnapshot
  private accumulator = 0
  private speedValue = 1
  private pausedValue = false
  private destroyedValue = false
  private crashValue: CrashReport | null = null
  private viewErrorValue: unknown = null
  private frameValue: GameFrame

  constructor(options: GameOptions) {
    this.mode = options.mode ?? 'main'
    if (this.mode === 'worker') {
      throw new LuneGoError(
        'worker_not_implemented',
        'worker mode is reserved by the protocol but not implemented yet; use mode: main',
      )
    }
    this.features = collectFeatures(options.features)
    this.timeMode = options.timeMode ?? 'realtime'
    this.schemaVersion = options.schemaVersion ?? 1
    this.dt = options.dt ?? 1 / 60
    this.dev = options.dev ?? true
    this.content = options.content
    this.onDiagnostic = options.onDiagnostic
    this.onFrame = options.onFrame
    this.onError = options.onError
    this.onTimeGap = options.onTimeGap
    this.maxCatchUp = options.maxCatchUp ?? 0.25
    this.maxTicksPerUpdate = options.maxTicksPerUpdate ?? 600
    this.checkpointInterval = options.checkpointInterval ?? 60
    if (!Number.isFinite(this.dt) || this.dt <= 0) {
      throw new LuneGoError('game_invalid', 'dt must be positive')
    }
    if (!Number.isFinite(this.maxCatchUp) || this.maxCatchUp < 0) {
      throw new LuneGoError('game_invalid', 'maxCatchUp must be non-negative')
    }
    if (!Number.isInteger(this.maxTicksPerUpdate) || this.maxTicksPerUpdate < 1) {
      throw new LuneGoError('game_invalid', 'maxTicksPerUpdate must be positive')
    }
    if (!Number.isInteger(this.checkpointInterval) || this.checkpointInterval < 1) {
      throw new LuneGoError('game_invalid', 'checkpointInterval must be positive')
    }
    this.modelDefs = uniqueModels(this.features)
    this.interpolated = interpolatedComponents(this.features)
    this.worldValue = new World(this.restoreOptions())
    this.initialSnapshot = this.worldValue.snapshot()
    const initialHash = this.worldValue.hash()
    this.hashLog.push({ tick: 0, hash: initialHash })
    this.checkpoints.push({ tick: 0, hash: initialHash })
    this.frameValue = buildGameFrame(
      this.worldValue,
      this.modelDefs,
      this.dt,
      false,
      this.worldValue.frame,
    )
    this.viewSource = createRenderSource({
      world: this.worldValue,
      previousValues: this.previousValues,
      alpha: () => this.alpha,
    })
  }
  get tick(): number {
    return this.worldValue.tick
  }

  /** Read-only frame subscription for UI/view adapters. */
  subscribeFrames(listener: (frame: GameFrame) => void): () => void {
    this.frameListeners.add(listener)
    listener(this.frameValue)
    return () => { this.frameListeners.delete(listener) }
  }
  get paused(): boolean {
    return this.pausedValue
  }
  get speed(): number {
    return this.speedValue
  }
  get alpha(): number {
    if (this.timeMode !== 'realtime') {
      return 1
    }
    return Math.min(1, this.accumulator / this.dt)
  }
  get frame(): GameFrame {
    return this.frameValue
  }
  get models(): Readonly<Record<string, unknown>> {
    return this.frameValue.models
  }
  get view(): RenderSource {
    return this.viewSource
  }
  get crashReport(): CrashReport | null {
    return this.crashValue
  }
  get viewError(): unknown {
    return this.viewErrorValue
  }
  get pendingCommandCount(): number {
    return this.worldValue.pendingCommandCount
  }

  send<C extends CommandDef>(
    command: C,
    payload: CommandPayload<C>,
    options?: SendOptions,
  ): Promise<CommandOutcome>
  send(type: string, payload: unknown, options?: SendOptions): Promise<CommandOutcome>
  send(
    command: CommandDef | string,
    payload: unknown,
    options?: SendOptions,
  ): Promise<CommandOutcome> {
    if (this.destroyedValue) {
      return Promise.reject(new LuneGoError('game_destroyed', 'game is destroyed'))
    }
    if (typeof command === 'string') {
      return this.worldValue.send(command, payload, options)
    }
    return this.worldValue.send(command, payload as CommandPayload<CommandDef>, options)
  }

  query<Args, Result>(query: QueryDef<Args, Result>, args: Args): Result {
    return this.worldValue.runQuery(query, args)
  }

  pause(): void {
    this.pausedValue = true
  }

  resume(): void {
    this.pausedValue = false
  }

  setSpeed(speed: number): void {
    if (!Number.isFinite(speed) || speed <= 0) {
      throw new LuneGoError('game_invalid', 'speed must be positive')
    }
    this.speedValue = speed
  }

  update(deltaSeconds: number): number {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new LuneGoError('game_invalid', 'deltaSeconds must be non-negative')
    }
    if (this.destroyedValue || this.crashValue !== null || this.pausedValue) {
      return 0
    }
    if (this.timeMode === 'onDemand') {
      if (this.worldValue.pendingCommandCount === 0) {
        return 0
      }
      return this.stepInternal(true) === null ? 0 : 1
    }
    let pending = deltaSeconds * this.speedValue
    if (this.timeMode === 'realtime' && pending > this.maxCatchUp) {
      const decision = resolveTimeGap(
        pending,
        this.maxCatchUp,
        this.worldValue.tick,
        this.onTimeGap,
      )
      if (decision === 'pause') {
        this.pausedValue = true
        return 0
      }
      if (decision === 'skip') {
        pending = this.maxCatchUp
      }
    }
    this.accumulator += pending
    let steps = 0
    while (this.accumulator >= this.dt && steps < this.maxTicksPerUpdate) {
      if (this.stepInternal(this.timeMode !== 'fastForward') === null) {
        break
      }
      this.accumulator -= this.dt
      steps += 1
    }
    return steps
  }

  step(count = 1): GameFrame {
    if (!Number.isInteger(count) || count < 1) {
      throw new LuneGoError('game_invalid', 'step count must be a positive integer')
    }
    for (let index = 0; index < count; index += 1) {
      const frame = this.stepInternal(true)
      if (frame === null) {
        throw new LuneGoError(
          'game_crashed',
          this.crashValue?.message ?? 'world stopped after an error',
        )
      }
    }
    this.accumulator = 0
    return this.frameValue
  }

  save(): WorldSnapshot { return this.worldValue.snapshot() }

  /** Snapshots world and profile scopes at the same tick. */
  saveGame(): GameSave {
    return snapshotGame(this.worldValue)
  }

  load(snapshot: WorldSnapshot): void {
    if (this.destroyedValue) {
      throw new LuneGoError('game_destroyed', 'game is destroyed')
    }
    this.installWorld(restoreWorldSnapshot(snapshot, this.restoreOptions()), snapshot)
  }

  /**
   * Loads a paired world/profile save. Both snapshots must be from the same
   * tick and content; a failure leaves the running world untouched.
   */
  loadGame(save: GameSave): void {
    if (this.destroyedValue) {
      throw new LuneGoError('game_destroyed', 'game is destroyed')
    }
    const loaded = restoreGameSave(save, this.restoreOptions())
    this.installWorld(loaded.world, loaded.initialSnapshot)
  }

  private installWorld(next: World, initialSnapshot: WorldSnapshot): void {
    worldInternals(this.worldValue).rejectPending(
      new LuneGoError('game_loaded', 'game was loaded before the command ran'),
    )
    this.worldValue = next
    this.initialSnapshot = initialSnapshot
    this.hashLog.length = 0
    this.checkpoints.length = 0
    const hash = this.worldValue.hash()
    this.hashLog.push({ tick: this.worldValue.tick, hash })
    this.checkpoints.push({ tick: this.worldValue.tick, hash })
    this.accumulator = 0
    this.previousValues.clear()
    this.viewSource = createRenderSource({
      world: this.worldValue,
      previousValues: this.previousValues,
      alpha: () => this.alpha,
    })
    this.crashValue = null
    this.viewErrorValue = null
    this.frameValue = buildGameFrame(
      this.worldValue,
      this.modelDefs,
      this.dt,
      false,
      this.worldValue.frame,
    )
    for (const listener of this.frameListeners) {
      listener(this.frameValue)
    }
  }

  exportReplay(): ReplayData {
    return exportSession(
      this.worldValue,
      this.initialSnapshot,
      this.schemaVersion,
      this.hashLog,
      this.checkpoints,
    )
  }

  replay(data: ReplayData): ReplayReport {
    return replaySession(data, {
      features: this.features,
      dt: this.dt,
      dev: this.dev,
      ...(this.content === undefined ? {} : { content: this.content }),
    })
  }

  destroy(): void {
    if (this.destroyedValue) {
      return
    }
    this.destroyedValue = true
    worldInternals(this.worldValue).rejectPending(
      new LuneGoError('game_destroyed', 'game was destroyed before the command ran'),
    )
  }
  private restoreOptions(): RestoreOptions {
    return {
      features: this.features,
      schemaVersion: this.schemaVersion,
      dt: this.dt,
      dev: this.dev,
      ...(this.content === undefined ? {} : { content: this.content }),
      ...(this.onDiagnostic === undefined ? {} : { onDiagnostic: this.onDiagnostic }),
    }
  }
  private stepInternal(render: boolean): GameFrame | null {
    capturePreviousValues(this.worldValue, this.interpolated, this.previousValues)
    try {
      const coreFrame = this.worldValue.step()
      const frame = buildGameFrame(
        this.worldValue,
        this.modelDefs,
        this.dt,
        render,
        coreFrame,
      )
      this.hashLog.push({ tick: frame.tick, hash: frame.hash })
      if (frame.tick % this.checkpointInterval === 0) {
        this.checkpoints.push({ tick: frame.tick, hash: frame.hash })
      }
      this.frameValue = frame
      for (const listener of this.frameListeners) {
        listener(frame)
      }
      if (this.onFrame !== undefined) {
        try {
          this.onFrame(frame)
        } catch (error) {
          this.viewErrorValue = error
        }
      }
      return frame
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error))
      this.crashValue = toCrashReport(normalized, this.worldValue, this.hashLog)
      this.onError?.(this.crashValue)
      return null
    }
  }
}

export function createGame(options: GameOptions): Game {
  return new Game(options)
}
