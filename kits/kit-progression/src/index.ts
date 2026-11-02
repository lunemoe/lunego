import type { StatModifier } from '@lunego/kit-stats'

export interface XpCurve {
  /** Highest reachable level; default Infinity. */
  readonly maxLevel?: number
  levelForXp(xp: number): number
  xpForLevel(level: number): number
}

/** Builds a cumulative XP curve; thresholds[0] is XP required for level 2. */
export function tableXpCurve(thresholds: readonly number[]): XpCurve {
  for (const threshold of thresholds) {
    if (!Number.isFinite(threshold) || threshold < 0) {
      throw new Error('xp thresholds must be finite non-negative numbers')
    }
  }
  const cumulative: number[] = [0]
  for (const threshold of thresholds) {
    cumulative.push((cumulative[cumulative.length - 1] ?? 0) + threshold)
  }
  return {
    maxLevel: cumulative.length,
    levelForXp(xp: number): number {
      const value = Math.max(0, xp)
      let level = 1
      while (level < cumulative.length && value >= (cumulative[level] ?? Infinity)) {
        level += 1
      }
      return level
    },
    xpForLevel(level: number): number {
      if (!Number.isInteger(level) || level < 1) {
        throw new Error('level must be a positive integer')
      }
      return cumulative[Math.min(level - 1, cumulative.length - 1)] ?? 0
    },
  }
}

export interface ProgressionPrerequisite {
  readonly id: string
  readonly level?: number
}

export interface ProgressionNode {
  readonly id: string
  readonly maxLevel?: number
  readonly requires?: readonly ProgressionPrerequisite[]
  readonly flags?: readonly string[]
  readonly modifiers?: readonly StatModifier[]
  readonly abilities?: readonly string[]
}

function validateNode(node: ProgressionNode): void {
  if (node.id.length === 0) {
    throw new Error('progression node id must not be empty')
  }
  const max = node.maxLevel ?? 1
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(`node ${node.id} maxLevel must be positive`)
  }
  for (const prerequisite of node.requires ?? []) {
    if (prerequisite.level !== undefined && (!Number.isInteger(prerequisite.level) || prerequisite.level < 1)) {
      throw new Error(`node ${node.id} prerequisite level must be positive`)
    }
  }
}

/** Deterministic prerequisite graph with cycle detection and sorted traversal. */
export class ProgressionGraph {
  readonly nodes: ReadonlyMap<string, ProgressionNode>

  constructor(nodes: readonly ProgressionNode[]) {
    const map = new Map<string, ProgressionNode>()
    for (const node of nodes) {
      validateNode(node)
      if (map.has(node.id)) {
        throw new Error(`duplicate progression node ${node.id}`)
      }
      map.set(node.id, node)
    }
    for (const node of map.values()) {
      for (const prerequisite of node.requires ?? []) {
        if (!map.has(prerequisite.id)) {
          throw new Error(`node ${node.id} requires unknown ${prerequisite.id}`)
        }
      }
    }
    this.nodes = map
    this.detectCycles(map)
  }

  order(): readonly string[] {
    return [...this.nodes.keys()].sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
  }

  get(id: string): ProgressionNode | undefined {
    return this.nodes.get(id)
  }

  private detectCycles(nodes: ReadonlyMap<string, ProgressionNode>): void {
    const state = new Map<string, 'visiting' | 'done'>()
    const visit = (id: string): void => {
      const current = state.get(id)
      if (current === 'visiting') {
        throw new Error(`progression graph cycle at ${id}`)
      }
      if (current === 'done') {
        return
      }
      state.set(id, 'visiting')
      for (const prerequisite of nodes.get(id)?.requires ?? []) {
        visit(prerequisite.id)
      }
      state.set(id, 'done')
    }
    for (const id of this.order()) {
      visit(id)
    }
  }
}

export interface ProgressionState {
  readonly xp: number
  readonly level: number
  readonly points: number
  readonly ranks: Readonly<Record<string, number>>
}

/** XP/level/points plus graph allocation; effects are derived, never stored. */
export class Progression {
  readonly graph: ProgressionGraph
  readonly curve: XpCurve
  readonly pointsPerLevel: number
  private readonly onAllocate: ((node: ProgressionNode, rank: number) => void) | undefined
  private readonly onRespec: ((refunded: number) => void) | undefined
  private xpValue = 0
  private levelValue = 1
  private pointsValue = 0
  private readonly ranks = new Map<string, number>()

  constructor(options: {
    readonly graph: ProgressionGraph
    readonly curve: XpCurve
    readonly pointsPerLevel?: number
    readonly state?: ProgressionState
    readonly onAllocate?: (node: ProgressionNode, rank: number) => void
    readonly onRespec?: (refunded: number) => void
  }) {
    this.graph = options.graph
    this.curve = options.curve
    this.pointsPerLevel = options.pointsPerLevel ?? 1
    this.onAllocate = options.onAllocate
    this.onRespec = options.onRespec
    if (!Number.isInteger(this.pointsPerLevel) || this.pointsPerLevel < 0) {
      throw new Error('pointsPerLevel must be a non-negative integer')
    }
    if (options.state !== undefined) {
      this.restore(options.state)
    }
  }

  get xp(): number {
    return this.xpValue
  }

  get level(): number {
    return this.levelValue
  }

  get points(): number {
    return this.pointsValue
  }

  rank(id: string): number {
    return this.ranks.get(id) ?? 0
  }

  addXp(amount: number): number {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('xp amount must be finite and non-negative')
    }
    this.xpValue += amount
    const nextLevel = Math.min(
      this.curve.levelForXp(this.xpValue),
      this.curve.maxLevel ?? Number.POSITIVE_INFINITY,
    )
    const gained = Math.max(0, nextLevel - this.levelValue)
    this.levelValue = nextLevel
    this.pointsValue += gained * this.pointsPerLevel
    return gained
  }

  canAllocate(id: string): boolean {
    const node = this.graph.get(id)
    if (node === undefined || this.pointsValue < 1) {
      return false
    }
    if (this.rank(id) >= (node.maxLevel ?? 1)) {
      return false
    }
    return (node.requires ?? []).every((requirement) =>
      this.rank(requirement.id) >= (requirement.level ?? 1),
    )
  }

  allocate(id: string): boolean {
    if (!this.canAllocate(id)) {
      return false
    }
    const rank = this.rank(id) + 1
    this.ranks.set(id, rank)
    this.pointsValue -= 1
    const node = this.graph.get(id)
    if (node !== undefined) {
      this.onAllocate?.(node, rank)
    }
    return true
  }

  /** Refunds every spent point and clears ranks; XP/level are preserved. */
  respec(): number {
    let refunded = 0
    for (const amount of this.ranks.values()) {
      refunded += amount
    }
    this.ranks.clear()
    this.pointsValue += refunded
    this.onRespec?.(refunded)
    return refunded
  }

  flags(): readonly string[] {
    const flags = new Set<string>()
    for (const id of this.graph.order()) {
      if (this.rank(id) > 0) {
        for (const flag of this.graph.get(id)?.flags ?? []) {
          flags.add(flag)
        }
      }
    }
    return [...flags].sort()
  }

  modifiers(): readonly StatModifier[] {
    const result: StatModifier[] = []
    for (const id of this.graph.order()) {
      const rank = this.rank(id)
      if (rank === 0) {
        continue
      }
      for (const modifier of this.graph.get(id)?.modifiers ?? []) {
        result.push({ ...modifier, source: `progression:${id}` })
      }
    }
    return result
  }

  abilities(): readonly string[] {
    const abilities = new Set<string>()
    for (const id of this.graph.order()) {
      if (this.rank(id) > 0) {
        for (const ability of this.graph.get(id)?.abilities ?? []) {
          abilities.add(ability)
        }
      }
    }
    return [...abilities].sort()
  }

  state(): ProgressionState {
    return {
      xp: this.xpValue,
      level: this.levelValue,
      points: this.pointsValue,
      ranks: Object.fromEntries(this.graph.order().map((id) => [id, this.rank(id)])),
    }
  }

  restore(state: ProgressionState): void {
    if (state.xp < 0 || state.level < 1 || state.points < 0) {
      throw new Error('invalid progression state')
    }
    this.xpValue = state.xp
    this.levelValue = state.level
    this.pointsValue = state.points
    this.ranks.clear()
    for (const id of this.graph.order()) {
      const rank = state.ranks[id] ?? 0
      if (!Number.isInteger(rank) || rank < 0 || rank > (this.graph.get(id)?.maxLevel ?? 1)) {
        throw new Error(`invalid rank for progression node ${id}`)
      }
      this.ranks.set(id, rank)
    }
  }
}
