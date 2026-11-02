import type { QuestStatus } from '@lunego/kit-quest'
import { validateNode } from './validation.js'

import type {
  DialogueChoice,
  DialogueCondition,
  DialogueEffect,
  DialogueNode,
} from './types.js'

export type {
  DialogueChoice,
  DialogueCondition,
  DialogueEffect,
  DialogueEffectKind,
  DialogueNode,
} from './types.js'

export interface DialogueContext {
  flag(key: string): boolean
  questStatus?(quest: string): QuestStatus | null
  counter?(key: string): number
}

export interface DialogueHooks {
  onEffect?(effect: DialogueEffect): void
}

export interface DialogueChoiceView extends DialogueChoice {
  readonly available: boolean
  readonly used: boolean
}

export interface DialogueView {
  readonly node: DialogueNode
  readonly choices: readonly DialogueChoiceView[]
}

export interface DialogueStep {
  readonly ok: boolean
  readonly reason?: 'not_started' | 'unknown_node' | 'unknown_choice' | 'unavailable'
  readonly view?: DialogueView
}

export interface DialogueSnapshot {
  readonly version: 1
  readonly current: string | null
  /** Used once-choice keys in `nodeId\u0000choiceId` form. */
  readonly used: readonly string[]
}

function snapshotObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

/** Deterministic dialogue graph runner; definitions are static localization keys. */
export class DialogueGraph {
  readonly nodes: ReadonlyMap<string, DialogueNode>

  constructor(nodes: readonly DialogueNode[]) {
    const map = new Map<string, DialogueNode>()
    for (const node of nodes) {
      validateNode(node)
      if (map.has(node.id)) {
        throw new Error(`duplicate dialogue node ${node.id}`)
      }
      map.set(node.id, node)
    }
    for (const node of map.values()) {
      for (const target of [node.next, ...(node.choices ?? []).map((choice) => choice.next)]) {
        if (target !== undefined && !map.has(target)) {
          throw new Error(`dialogue node ${node.id} points to unknown ${target}`)
        }
      }
    }
    this.detectCycles(map)
    this.validateReachability(map)
    this.nodes = map
  }

  private detectCycles(nodes: ReadonlyMap<string, DialogueNode>): void {
    const indices = new Map<string, number>()
    const lowLinks = new Map<string, number>()
    const stack: string[] = []
    const onStack = new Set<string>()
    let nextIndex = 0
    const visit = (id: string): void => {
      indices.set(id, nextIndex)
      lowLinks.set(id, nextIndex)
      nextIndex += 1
      stack.push(id)
      onStack.add(id)
      const node = nodes.get(id)
      for (const target of node === undefined
        ? []
        : [node.next, ...(node.choices ?? []).map((choice) => choice.next)]) {
        if (target === undefined) {
          continue
        }
        if (!indices.has(target)) {
          visit(target)
          lowLinks.set(id, Math.min(lowLinks.get(id) ?? 0, lowLinks.get(target) ?? 0))
        } else if (onStack.has(target)) {
          lowLinks.set(id, Math.min(lowLinks.get(id) ?? 0, indices.get(target) ?? 0))
        }
      }
      if (lowLinks.get(id) !== indices.get(id)) {
        return
      }
      const component: string[] = []
      for (;;) {
        const member = stack.pop()
        if (member === undefined) {
          break
        }
        onStack.delete(member)
        component.push(member)
        if (member === id) {
          break
        }
      }
      const selfNode = nodes.get(id)
      const selfLoop = selfNode !== undefined &&
        [selfNode.next, ...(selfNode.choices ?? []).map((choice) => choice.next)].includes(id)
      if (component.length === 1 && !selfLoop) {
        return
      }
      if (!component.some((member) => nodes.get(member)?.hub === true)) {
        throw new Error(
          `dialogue graph cycle ${component.sort().join(' -> ')} must include a hub node`,
        )
      }
    }
    for (const id of [...nodes.keys()].sort()) {
      if (!indices.has(id)) {
        visit(id)
      }
    }
  }

  private validateReachability(nodes: ReadonlyMap<string, DialogueNode>): void {
    const incoming = new Map<string, number>()
    for (const id of nodes.keys()) {
      incoming.set(id, 0)
    }
    for (const node of nodes.values()) {
      for (const target of [node.next, ...(node.choices ?? []).map((choice) => choice.next)]) {
        if (target !== undefined) {
          incoming.set(target, (incoming.get(target) ?? 0) + 1)
        }
      }
    }
    const roots = [...nodes.keys()]
      .filter((id) => (incoming.get(id) ?? 0) === 0)
      .sort()
    if (roots.length === 0) {
      throw new Error('dialogue graph has no entry node')
    }
    const reachable = new Set<string>()
    const stack = [...roots]
    while (stack.length > 0) {
      const id = stack.pop()
      if (id === undefined || reachable.has(id)) {
        continue
      }
      reachable.add(id)
      const node = nodes.get(id)
      if (node === undefined) {
        continue
      }
      for (const target of [node.next, ...(node.choices ?? []).map((choice) => choice.next)]) {
        if (target !== undefined) {
          stack.push(target)
        }
      }
    }
    for (const id of [...nodes.keys()].sort()) {
      if (!reachable.has(id)) {
        throw new Error(`dialogue node ${id} is unreachable from an entry node`)
      }
    }
  }
}

export function evaluateCondition(
  condition: DialogueCondition,
  context: DialogueContext,
): boolean {
  if (condition.kind === 'flag') {
    return context.flag(condition.key) === (condition.value ?? true)
  }
  if (condition.kind === 'quest') {
    return (context.questStatus?.(condition.key) ?? null) === (condition.value ?? null)
  }
  const actual = context.counter?.(condition.key) ?? 0
  const expected = typeof condition.value === 'number' ? condition.value : 0
  if ((condition.op ?? 'eq') === 'gte') {
    return actual >= expected
  }
  if ((condition.op ?? 'eq') === 'lte') {
    return actual <= expected
  }
  return actual === expected
}

export interface DialogueRunnerOptions {
  readonly graph: DialogueGraph
  readonly context: DialogueContext
  readonly hooks?: DialogueHooks
  /** Maximum accepted transitions in one conversation; default 256. */
  readonly maxSteps?: number
}

export class DialogueRunner {
  private readonly graph: DialogueGraph
  private readonly context: DialogueContext
  private readonly hooks: DialogueHooks
  private readonly maxSteps: number
  private currentId: string | null = null
  private used = new Set<string>()
  private stepCount = 0

  constructor(options: DialogueRunnerOptions) {
    if (
      options.maxSteps !== undefined &&
      (!Number.isInteger(options.maxSteps) || options.maxSteps < 1)
    ) {
      throw new Error('dialogue maxSteps must be a positive integer')
    }
    this.graph = options.graph
    this.context = options.context
    this.hooks = options.hooks ?? {}
    this.maxSteps = options.maxSteps ?? 256
  }

  get current(): DialogueNode | null {
    return this.currentId === null ? null : this.graph.nodes.get(this.currentId) ?? null
  }

  serialize(): DialogueSnapshot {
    return {
      version: 1,
      current: this.currentId,
      used: [...this.used].sort(),
    }
  }

  /** Restores current node and once-choice usage; unknown node/choice throws. */
  restore(snapshot: DialogueSnapshot): void {
    const root = snapshotObject(snapshot, 'dialogue snapshot')
    if (root['version'] !== 1) {
      throw new Error('dialogue snapshot version must be 1')
    }
    const current = root['current']
    if (current !== null && (typeof current !== 'string' || !this.graph.nodes.has(current))) {
      throw new Error(`dialogue snapshot references unknown node ${String(current)}`)
    }
    if (!Array.isArray(root['used'])) {
      throw new Error('dialogue snapshot used must be an array')
    }
    const used = new Set<string>()
    for (const key of root['used']) {
      if (typeof key !== 'string') {
        throw new Error('dialogue snapshot used entries must be strings')
      }
      const separator = key.indexOf('\u0000')
      if (separator <= 0 || separator === key.length - 1) {
        throw new Error(`dialogue snapshot has malformed used choice ${key}`)
      }
      const nodeId = key.slice(0, separator)
      const choiceId = key.slice(separator + 1)
      const node = this.graph.nodes.get(nodeId)
      const choice = node?.choices?.find((entry) => entry.id === choiceId)
      if (node === undefined || choice === undefined || choice.once !== true) {
        throw new Error(`dialogue snapshot references unknown once choice ${key}`)
      }
      if (used.has(key)) {
        throw new Error(`dialogue snapshot repeats used choice ${key}`)
      }
      used.add(key)
    }
    this.currentId = current
    this.used = used
    this.stepCount = 0
  }

  start(id: string): DialogueStep {
    const node = this.graph.nodes.get(id)
    if (node === undefined) {
      return { ok: false, reason: 'unknown_node' }
    }
    if (!this.allows(node.conditions)) {
      return { ok: false, reason: 'unavailable' }
    }
    this.currentId = id
    this.stepCount = 0
    this.emit(node.effects)
    return { ok: true, view: this.view(node) }
  }

  choose(choiceId: string): DialogueStep {
    const node = this.current
    if (this.currentId === null || node === null) {
      return { ok: false, reason: 'not_started' }
    }
    const choice = node.choices?.find((entry) => entry.id === choiceId)
    if (choice === undefined) {
      return { ok: false, reason: 'unknown_choice' }
    }
    const key = `${node.id}\u0000${choice.id}`
    if ((choice.once === true && this.used.has(key)) || !this.allows(choice.conditions)) {
      return { ok: false, reason: 'unavailable' }
    }
    if (this.stepCount >= this.maxSteps) {
      throw new Error(`dialogue exceeded maxSteps ${this.maxSteps}`)
    }
    this.stepCount += 1
    if (choice.once === true) {
      this.used.add(key)
    }
    this.emit(choice.effects)
    if (choice.next === undefined) {
      this.currentId = null
      return { ok: true }
    }
    const next = this.graph.nodes.get(choice.next)
    if (next === undefined) {
      return { ok: false, reason: 'unknown_node' }
    }
    if (!this.allows(next.conditions)) {
      return { ok: false, reason: 'unavailable' }
    }
    this.currentId = choice.next
    this.emit(next.effects)
    return { ok: true, view: this.view(next) }
  }

  view(node: DialogueNode = this.current as DialogueNode): DialogueView {
    return {
      node,
      choices: (node.choices ?? []).map((choice) => {
        const key = `${node.id}\u0000${choice.id}`
        return {
          ...choice,
          available: !(choice.once === true && this.used.has(key)) && this.allows(choice.conditions),
          used: choice.once === true && this.used.has(key),
        }
      }),
    }
  }

  private allows(conditions: readonly DialogueCondition[] | undefined): boolean {
    return (conditions ?? []).every((condition) => evaluateCondition(condition, this.context))
  }

  private emit(effects: readonly DialogueEffect[] | undefined): void {
    for (const effect of effects ?? []) {
      this.hooks.onEffect?.(effect)
    }
  }
}
