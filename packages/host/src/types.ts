import type {
  CommandEnvelope,
  CommandDef,
  CommandOutcome,
  CommandPayload,
  ComponentDef,
  ContentRegistry,
  CueInstance,
  Diagnostic,
  Entity,
  FeatureDef,
  FrameEvent,
  ModelPatch,
  QueryArg,
  QueryDef,
  DeepReadonly,
  SchemaShape,
  SchemaValue,
  SendOptions,
  TagDef,
  WorldSnapshot,
} from '@lunego/core'

export type HostMode = 'main' | 'worker'
export type TimeMode = 'realtime' | 'onDemand' | 'fastForward'
export type TimeGapDecision = 'catchUp' | 'skip' | 'pause'

export interface TimeGap {
  readonly gap: number
  readonly maxCatchUp: number
  readonly tick: number
}

export interface GameFrame {
  readonly tick: number
  readonly dt: number
  readonly elapsed: number
  readonly render: boolean
  readonly events: readonly FrameEvent[]
  readonly cues: readonly CueInstance[]
  readonly modelPatches: readonly ModelPatch[]
  readonly models: Readonly<Record<string, unknown>>
  readonly entityCount: number
  readonly hash: string
}

export interface RenderSource {
  readonly alpha: number
  entities(...args: QueryArg[]): readonly Entity[]
  get<S extends SchemaShape>(
    entity: Entity,
    component: ComponentDef<S>,
  ): DeepReadonly<SchemaValue<S>> | undefined
  prev<S extends SchemaShape>(
    entity: Entity,
    component: ComponentDef<S>,
  ): DeepReadonly<SchemaValue<S>> | undefined
  has(entity: Entity, target: ComponentDef | TagDef): boolean
}

export interface ReplayCheckpoint {
  readonly tick: number
  readonly hash: string
}

export interface ReplayHash {
  readonly tick: number
  readonly hash: string
}

export interface ReplayData {
  readonly schemaVersion: number
  readonly snapshot: WorldSnapshot
  readonly commands: readonly CommandEnvelope[]
  readonly checkpoints: readonly ReplayCheckpoint[]
  readonly hashes: readonly ReplayHash[]
  readonly endTick: number
}

export interface ReplayReport {
  readonly ok: boolean
  readonly endTick: number
  readonly firstDivergenceTick: number | null
  readonly checkpointMismatch: boolean
}

export interface CrashReport {
  readonly message: string
  readonly stack: string | null
  readonly tick: number
  readonly snapshot: WorldSnapshot
  readonly commandLog: readonly CommandEnvelope[]
  readonly hashes: readonly ReplayHash[]
}

export interface GameOptions {
  readonly features: readonly FeatureDef[]
  readonly seed?: number
  readonly schemaVersion?: number
  readonly dt?: number
  readonly dev?: boolean
  readonly content?: ContentRegistry
  readonly onDiagnostic?: (diagnostic: Diagnostic) => void
  readonly mode?: HostMode
  readonly timeMode?: TimeMode
  readonly maxCatchUp?: number
  readonly maxTicksPerUpdate?: number
  readonly checkpointInterval?: number
  readonly onTimeGap?: (gap: TimeGap) => TimeGapDecision
  readonly onFrame?: (frame: GameFrame) => void
  readonly onError?: (report: CrashReport) => void
}

export type { CommandDef, CommandOutcome, CommandPayload, QueryDef, SendOptions }
