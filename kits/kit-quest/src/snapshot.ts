import type { QuestDef, QuestObjectiveState, QuestState, QuestStatus } from './types.js'

export interface QuestLogSnapshot {
  readonly version: 1
  readonly worldDayIndex: number
  readonly tracked: readonly string[]
  readonly quests: Readonly<Record<string, QuestState>>
}

export interface ParsedQuestSnapshot {
  readonly worldDayIndex: number
  readonly tracked: readonly string[]
  readonly states: ReadonlyMap<string, QuestState>
}

const STATUSES: readonly QuestStatus[] = [
  'available',
  'active',
  'completed',
  'turnedIn',
  'failed',
]

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function integerValue(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`)
  }
  return value
}

function nullableInteger(value: unknown, label: string): number | null {
  return value === null ? null : integerValue(value, label)
}

function questState(value: unknown, def: QuestDef, label: string): QuestState {
  const state = objectValue(value, label)
  const status = state['status']
  if (typeof status !== 'string' || !(STATUSES as readonly string[]).includes(status)) {
    throw new Error(`${label}.status is not a known quest status`)
  }
  const progressValue = objectValue(state['progress'], `${label}.progress`)
  const objectives = new Map(def.objectives.map((objective) => [objective.id, objective]))
  const progress: Record<string, QuestObjectiveState> = {}
  for (const [objectiveId, objectiveValue] of Object.entries(progressValue)) {
    const objective = objectives.get(objectiveId)
    if (objective === undefined) {
      throw new Error(`${label}.progress references unknown objective ${objectiveId}`)
    }
    const objectiveState = objectValue(objectiveValue, `${label}.progress.${objectiveId}`)
    const count = integerValue(objectiveState['count'], `${label}.progress.${objectiveId}.count`)
    if (count < 0 || count > objective.required) {
      throw new Error(`${label}.progress.${objectiveId}.count is outside 0..${objective.required}`)
    }
    if (!Array.isArray(objectiveState['seen'])) {
      throw new Error(`${label}.progress.${objectiveId}.seen must be an array`)
    }
    const seen = new Set<string>()
    for (const key of objectiveState['seen']) {
      if (typeof key !== 'string' || key.length === 0) {
        throw new Error(`${label}.progress.${objectiveId}.seen must contain non-empty strings`)
      }
      if (seen.has(key)) {
        throw new Error(`${label}.progress.${objectiveId}.seen repeats ${key}`)
      }
      seen.add(key)
    }
    progress[objectiveId] = { count, seen: [...seen].sort() }
  }
  const completed = status === 'completed' || status === 'turnedIn'
  if (completed) {
    for (const objective of def.objectives) {
      if ((progress[objective.id]?.count ?? 0) < objective.required) {
        throw new Error(`${label} is ${status} but objective ${objective.id} is incomplete`)
      }
    }
  }
  return {
    status: status as QuestStatus,
    progress,
    acceptedTick: nullableInteger(state['acceptedTick'], `${label}.acceptedTick`),
    completedTick: nullableInteger(state['completedTick'], `${label}.completedTick`),
    dayTurnedIn: nullableInteger(state['dayTurnedIn'], `${label}.dayTurnedIn`),
  }
}

/** Validates a caller-injected quest snapshot; unknown ids/objectives throw. */
export function parseQuestLogSnapshot(
  value: unknown,
  defs: ReadonlyMap<string, QuestDef>,
): ParsedQuestSnapshot {
  const root = objectValue(value, 'quest snapshot')
  if (root['version'] !== 1) {
    throw new Error('quest snapshot version must be 1')
  }
  const worldDayIndex = integerValue(root['worldDayIndex'], 'quest snapshot worldDayIndex')
  if (worldDayIndex < 0) {
    throw new Error('quest snapshot worldDayIndex must be non-negative')
  }
  if (!Array.isArray(root['tracked'])) {
    throw new Error('quest snapshot tracked must be an array')
  }
  const tracked = new Set<string>()
  for (const id of root['tracked']) {
    if (typeof id !== 'string' || !defs.has(id)) {
      throw new Error(`quest snapshot tracks unknown quest ${String(id)}`)
    }
    if (tracked.has(id)) {
      throw new Error(`quest snapshot repeats tracked quest ${id}`)
    }
    tracked.add(id)
  }
  const questValues = objectValue(root['quests'], 'quest snapshot quests')
  const states = new Map<string, QuestState>()
  for (const [id, state] of Object.entries(questValues)) {
    const def = defs.get(id)
    if (def === undefined) {
      throw new Error(`quest snapshot references unknown quest ${id}`)
    }
    states.set(id, questState(state, def, `quest snapshot ${id}`))
  }
  return {
    worldDayIndex,
    tracked: [...tracked].sort(),
    states,
  }
}
