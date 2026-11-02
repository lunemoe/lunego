export type QuestStatus = 'available' | 'active' | 'completed' | 'turnedIn' | 'failed'
export type ObjectiveType = 'kill' | 'collect' | 'talk' | 'reach' | 'use' | 'escort'
export type RepeatMode = 'none' | 'repeatable' | 'daily' | 'weekly'

export interface EscortPoint {
  readonly x: number
  readonly y: number
}

export interface EscortObservation extends EscortPoint {
  readonly alive: boolean
}

export type EscortStatus = 'active' | 'arrived' | 'failed'

export interface EscortProgress {
  readonly status: EscortStatus
  readonly distance: number
}

export interface QuestObjective {
  readonly id: string
  readonly type: ObjectiveType
  readonly target: string
  readonly required: number
  /** Only count the same unique key once (e.g. one specific drop). */
  readonly unique?: boolean
  /** Preferred escort id; falls back to `target` when omitted. */
  readonly escortId?: string
  /** Escort objectives require this destination. */
  readonly destination?: EscortPoint
  /** Escort completion radius in world units. */
  readonly radius?: number
}

/** Opaque reward request; the game maps it to wallet/inventory changes. */
export interface QuestReward {
  readonly id: string
  readonly [key: string]: unknown
}

export interface QuestDef {
  readonly id: string
  readonly objectives: readonly QuestObjective[]
  readonly prerequisites?: readonly string[]
  readonly chain?: string
  readonly repeat?: RepeatMode
  readonly rewards?: readonly QuestReward[]
  readonly tags?: readonly string[]
}

export interface QuestObjectiveState {
  readonly count: number
  readonly seen: readonly string[]
}

export interface QuestState {
  readonly status: QuestStatus
  readonly progress: Readonly<Record<string, QuestObjectiveState>>
  readonly acceptedTick: number | null
  readonly completedTick: number | null
  readonly dayTurnedIn: number | null
  /** Week index of the last turn-in for weekly quests; null when never turned in. */
  readonly weekTurnedIn?: number | null
}

export interface QuestEvent {
  readonly type: ObjectiveType
  readonly target: string
  readonly amount?: number
  readonly uniqueKey?: string
}

export interface QuestUpdate {
  readonly quest: string
  readonly objective: string
  readonly count: number
  readonly completed: boolean
  /** Set when an escort target died and the quest failed. */
  readonly failed?: boolean
}

export interface QuestTurnInResult {
  readonly ok: boolean
  readonly reason?: 'not_completed' | 'unknown' | 'not_found'
  readonly rewards: readonly QuestReward[]
}

export interface QuestLogOptions {
  readonly quests: readonly QuestDef[]
  readonly worldDayIndex?: number
  /** Current week index; derived from `tick` when `weekLengthTicks` is set. */
  readonly worldWeekIndex?: number
  /** Global ticks per week; required before calling `setTick`. */
  readonly weekLengthTicks?: number
  /** Optional initial tick, used with `weekLengthTicks` to derive the week. */
  readonly tick?: number
  readonly state?: Readonly<Record<string, QuestState>>
}
