import { sqrt } from '@lunego/core/math'
import type {
  EscortObservation,
  EscortProgress,
  QuestDef,
  QuestObjective,
  QuestUpdate,
} from './types.js'
import type { MutableQuestState } from './state.js'

/** Pure escort progress check: outside the radius stays active, death fails. */
export function escortProgress(
  objective: QuestObjective,
  observation: EscortObservation,
): EscortProgress {
  if (
    objective.type !== 'escort' ||
    objective.destination === undefined ||
    !Number.isFinite(objective.destination.x) ||
    !Number.isFinite(objective.destination.y) ||
    objective.radius === undefined ||
    !Number.isFinite(objective.radius) ||
    objective.radius < 0
  ) {
    throw new Error(`objective ${objective.id} is not a configured escort objective`)
  }
  if (
    !Number.isFinite(observation.x) ||
    !Number.isFinite(observation.y) ||
    typeof observation.alive !== 'boolean'
  ) {
    throw new Error('escort observation needs finite position and alive state')
  }
  const dx = observation.x - objective.destination.x
  const dy = observation.y - objective.destination.y
  const distance = sqrt(dx * dx + dy * dy)
  if (!observation.alive) {
    return { status: 'failed', distance }
  }
  return {
    status: distance <= objective.radius ? 'arrived' : 'active',
    distance,
  }
}


/** Applies one escort observation to every active matching objective. */
export function recordEscortProgress(
  defs: ReadonlyMap<string, QuestDef>,
  order: readonly string[],
  ensure: (def: QuestDef) => MutableQuestState,
  escortId: string,
  observation: EscortObservation,
  tick: number,
): readonly QuestUpdate[] {
  const updates: QuestUpdate[] = []
  for (const id of order) {
    const def = defs.get(id)
    if (def === undefined) {
      continue
    }
    const state = ensure(def)
    if (state.status !== 'active') {
      continue
    }
    for (const objective of def.objectives) {
      if (objective.type !== 'escort' || (objective.escortId ?? objective.target) !== escortId) {
        continue
      }
      const result = escortProgress(objective, observation)
      const progress = state.progress.get(objective.id) ?? { count: 0, seen: new Set<string>() }
      if (result.status === 'failed') {
        state.status = 'failed'
        updates.push({
          quest: id,
          objective: objective.id,
          count: progress.count,
          completed: false,
          failed: true,
        })
        break
      }
      if (result.status === 'arrived' && progress.count < objective.required) {
        progress.count = objective.required
        state.progress.set(objective.id, progress)
        const questCompleted = def.objectives.every(
          (entry) => (state.progress.get(entry.id)?.count ?? 0) >= entry.required,
        )
        if (questCompleted) {
          state.status = 'completed'
          state.completedTick = tick
        }
        updates.push({
          quest: id,
          objective: objective.id,
          count: progress.count,
          completed: progress.count >= objective.required,
        })
      }
    }
  }
  return updates
}
