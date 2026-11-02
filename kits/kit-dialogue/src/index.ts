import type { QuestStatus } from '@lunego/kit-quest'

export interface DialogueCondition {
  readonly kind: 'flag' | 'quest' | 'counter'
  readonly key: string
  readonly value?: string | number | boolean
  readonly op?: 'eq' | 'gte' | 'lte'
}

export type DialogueEffectKind = 'flag' | 'quest' | 'event'

export interface DialogueEffect {
  readonly kind: DialogueEffectKind
  readonly key: string
  readonly value?: unknown
}

export interface DialogueChoice {
  readonly id: string
  readonly textKey: string
  readonly next?: string
  readonly conditions?: readonly DialogueCondition[]
  readonly effects?: readonly DialogueEffect[]
  /** A once choice can never be selected again after it is used. */
  readonly once?: boolean
}

export interface DialogueNode {
  readonly id: string
  /** Localization key, not transient UI copy. */
  readonly textKey: string
  readonly next?: string
  readonly conditions?: readonly DialogueCondition[]
  readonly effects?: readonly DialogueEffect[]
  readonly choices?: readonly DialogueChoice[]
}

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

function validateCondition(condition: DialogueCondition): void {
  if (condition.key.length === 0) {
    throw new Error('dialogue condition key must not be empty')
  }
}

function validateNode(node: DialogueNode): void {
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
    this.nodes = map
  }

  private detectCycles(nodes: ReadonlyMap<string, DialogueNode>): void {
    const state = new Map<string, 'visiting' | 'done'>()
    const visit = (id: string): void => {
      if (state.get(id) === 'visiting') {
        throw new Error(`dialogue graph cycle at ${id}`)
      }
      if (state.get(id) === 'done') {
        return
      }
      state.set(id, 'visiting')
      const node = nodes.get(id)
      if (node !== undefined) {
        for (const target of [node.next, ...(node.choices ?? []).map((choice) => choice.next)]) {
          if (target !== undefined) {
            visit(target)
          }
        }
      }
      state.set(id, 'done')
    }
    for (const id of [...nodes.keys()].sort()) {
      visit(id)
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

export class DialogueRunner {
  private readonly graph: DialogueGraph
  private readonly context: DialogueContext
  private readonly hooks: DialogueHooks
  private currentId: string | null = null
  private readonly used = new Set<string>()

  constructor(options: {
    readonly graph: DialogueGraph
    readonly context: DialogueContext
    readonly hooks?: DialogueHooks
  }) {
    this.graph = options.graph
    this.context = options.context
    this.hooks = options.hooks ?? {}
  }

  get current(): DialogueNode | null {
    return this.currentId === null ? null : this.graph.nodes.get(this.currentId) ?? null
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
