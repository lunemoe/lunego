import type { QuestStatus } from './types.js'

export interface MutableQuestState {
  status: QuestStatus
  progress: Map<string, { count: number; seen: Set<string> }>
  acceptedTick: number | null
  completedTick: number | null
  dayTurnedIn: number | null
  weekTurnedIn: number | null
}

export function freshState(): MutableQuestState {
  return {
    status: 'available',
    progress: new Map(),
    acceptedTick: null,
    completedTick: null,
    dayTurnedIn: null,
    weekTurnedIn: null,
  }
}
