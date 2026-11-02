import type { DialogueCondition, DialogueNode } from './types.js'

function validateCondition(condition: DialogueCondition): void {
  if (condition.key.length === 0) {
    throw new Error('dialogue condition key must not be empty')
  }
}

export function validateNode(node: DialogueNode): void {
  if (node.id.length === 0 || node.textKey.length === 0) {
    throw new Error('dialogue node id/textKey must not be empty')
  }
  for (const condition of node.conditions ?? []) {
    validateCondition(condition)
  }
  for (const choice of node.choices ?? []) {
    if (choice.id.length === 0 || choice.textKey.length === 0) {
      throw new Error(`dialogue node ${node.id} has an invalid choice`)
    }
    for (const condition of choice.conditions ?? []) {
      validateCondition(condition)
    }
  }
}

