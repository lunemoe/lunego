export type QuestStatus = 'available' | 'active' | 'completed' | 'turnedIn' | 'failed'
export type ObjectiveType = 'kill' | 'collect' | 'talk' | 'reach' | 'use'
export type RepeatMode = 'none' | 'repeatable' | 'daily'

export interface QuestObjective {
  readonly id: string
  readonly type: ObjectiveType
  readonly target: string
  readonly required: number
  /** Only count the same unique key once (e.g. one specific drop). */
  readonly unique?: boolean
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
}
