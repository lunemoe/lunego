import type { QuestDef } from './types.js'

export function validateQuest(def: QuestDef): void {
  if (def.id.length === 0) {
    throw new Error('quest id must not be empty')
  }
  for (const objective of def.objectives) {
    if (objective.id.length === 0 || objective.required < 1 || !Number.isInteger(objective.required)) {
      throw new Error(`quest ${def.id} has an invalid objective`)
    }
  }
  if (
    def.repeat !== undefined &&
    !['none', 'repeatable', 'daily', 'weekly'].includes(def.repeat)
  ) {
    throw new Error(`quest ${def.id} has an invalid repeat mode`)
  }
  for (const objective of def.objectives) {
    if (objective.type !== 'escort') {
      continue
    }
    if (objective.required !== 1) {
      throw new Error(`quest ${def.id} escort objective ${objective.id} must require exactly 1`)
    }
    const escortId = objective.escortId ?? objective.target
    if (escortId.length === 0) {
      throw new Error(`quest ${def.id} escort objective ${objective.id} needs a non-empty escort id`)
    }
    if (
      objective.destination === undefined ||
      !Number.isFinite(objective.destination.x) ||
      !Number.isFinite(objective.destination.y)
    ) {
      throw new Error(`quest ${def.id} escort objective ${objective.id} needs a finite destination`)
    }
    if (objective.radius === undefined || !Number.isFinite(objective.radius) || objective.radius < 0) {
      throw new Error(`quest ${def.id} escort objective ${objective.id} needs a non-negative radius`)
    }
  }
}

