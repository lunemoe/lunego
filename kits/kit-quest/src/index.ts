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

export interface QuestEvent {
  readonly type: ObjectiveType
  readonly target: string
  readonly amount?: number
  readonly uniqueKey?: string
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

export interface QuestUpdate {
  readonly quest: string
  readonly objective: string
  readonly count: number
  readonly completed: boolean
}

export interface QuestTurnInResult {
  readonly ok: boolean
  readonly reason?: 'not_completed' | 'unknown' | 'not_found'
  readonly rewards: readonly QuestReward[]
}

export interface QuestLogOptions {
  readonly quests: readonly QuestDef[]
  readonly worldDayIndex?: number
  readonly state?: Readonly<Record<string, QuestState>>
}

interface MutableQuestState {
  status: QuestStatus
  progress: Map<string, { count: number; seen: Set<string> }>
  acceptedTick: number | null
  completedTick: number | null
  dayTurnedIn: number | null
}

function freshState(): MutableQuestState {
  return {
    status: 'available',
    progress: new Map(),
    acceptedTick: null,
    completedTick: null,
    dayTurnedIn: null,
  }
}

function validate(def: QuestDef): void {
  if (def.id.length === 0) {
    throw new Error('quest id must not be empty')
  }
  for (const objective of def.objectives) {
    if (objective.id.length === 0 || objective.required < 1 || !Number.isInteger(objective.required)) {
      throw new Error(`quest ${def.id} has an invalid objective`)
    }
  }
  if (def.repeat !== undefined && !['none', 'repeatable', 'daily'].includes(def.repeat)) {
    throw new Error(`quest ${def.id} has an invalid repeat mode`)
  }
}

/** Event-driven quest state machine; rewards are requests, not mutations. */
export class QuestLog {
  private readonly defs = new Map<string, QuestDef>()
  private readonly order: string[] = []
  private readonly states = new Map<string, MutableQuestState>()
  private readonly trackedSet = new Set<string>()
  private day: number

  constructor(options: QuestLogOptions) {
    this.day = options.worldDayIndex ?? 0
    for (const def of options.quests) {
      validate(def)
      if (this.defs.has(def.id)) {
        throw new Error(`duplicate quest ${def.id}`)
      }
      this.defs.set(def.id, def)
      this.order.push(def.id)
    }
    this.order.sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
    for (const [id, state] of Object.entries(options.state ?? {})) {
      if (!this.defs.has(id)) {
        throw new Error(`state references unknown quest ${id}`)
      }
      const restored = freshState()
      restored.status = state.status
      restored.acceptedTick = state.acceptedTick
      restored.completedTick = state.completedTick
      restored.dayTurnedIn = state.dayTurnedIn
      for (const [objective, progress] of Object.entries(state.progress)) {
        restored.progress.set(objective, { count: progress.count, seen: new Set(progress.seen) })
      }
      this.states.set(id, restored)
    }
  }

  get worldDayIndex(): number {
    return this.day
  }

  setWorldDayIndex(day: number): void {
    if (!Number.isInteger(day) || day < 0) {
      throw new Error('worldDayIndex must be a non-negative integer')
    }
    this.day = day
  }

  def(id: string): QuestDef | undefined {
    return this.defs.get(id)
  }

  status(id: string): QuestStatus | null {
    const def = this.defs.get(id)
    if (def === undefined) {
      return null
    }
    return this.ensure(def).status
  }

  available(id: string): boolean {
    const def = this.defs.get(id)
    if (def === undefined) {
      return false
    }
    const state = this.ensure(def)
    return this.availableFrom(def, state)
  }

  accept(id: string, tick: number): boolean {
    const def = this.defs.get(id)
    if (def === undefined) {
      return false
    }
    const state = this.ensure(def)
    if (!this.availableFrom(def, state)) {
      return false
    }
    state.status = 'active'
    state.acceptedTick = tick
    state.completedTick = null
    state.progress.clear()
    return true
  }

  /** Records one event; returns objective updates for active quests. */
  record(event: QuestEvent, tick: number): readonly QuestUpdate[] {
    const updates: QuestUpdate[] = []
    const amount = event.amount ?? 1
    if (!Number.isInteger(amount) || amount < 1) {
      return updates
    }
    for (const id of this.order) {
      const def = this.defs.get(id)
      if (def === undefined) {
        continue
      }
      const state = this.ensure(def)
      if (state.status !== 'active') {
        continue
      }
      for (const objective of def.objectives) {
        if (objective.type !== event.type || objective.target !== event.target) {
          continue
        }
        const progress = state.progress.get(objective.id) ?? { count: 0, seen: new Set<string>() }
        if (objective.unique === true) {
          if (event.uniqueKey === undefined || progress.seen.has(event.uniqueKey)) {
            continue
          }
          progress.seen.add(event.uniqueKey)
        }
        progress.count = Math.min(objective.required, progress.count + amount)
        state.progress.set(objective.id, progress)
        updates.push({
          quest: id,
          objective: objective.id,
          count: progress.count,
          completed: progress.count >= objective.required,
        })
      }
      if (def.objectives.every((objective) => (state.progress.get(objective.id)?.count ?? 0) >= objective.required)) {
        state.status = 'completed'
        state.completedTick = tick
      }
    }
    return updates
  }

  turnIn(id: string): QuestTurnInResult {
    const def = this.defs.get(id)
    if (def === undefined) {
      return { ok: false, reason: 'not_found', rewards: [] }
    }
    const state = this.ensure(def)
    if (state.status !== 'completed') {
      return { ok: false, reason: 'not_completed', rewards: [] }
    }
    state.dayTurnedIn = this.day
    if (def.repeat === 'repeatable' || def.repeat === 'daily') {
      state.status = 'available'
    } else {
      state.status = 'turnedIn'
    }
    return { ok: true, rewards: def.rewards ?? [] }
  }

  fail(id: string): boolean {
    const def = this.defs.get(id)
    if (def === undefined) {
      return false
    }
    const state = this.ensure(def)
    if (state.status !== 'active') {
      return false
    }
    state.status = 'failed'
    return true
  }

  track(id: string): boolean {
    if (!this.defs.has(id)) {
      return false
    }
    this.trackedSet.add(id)
    return true
  }

  untrack(id: string): void {
    this.trackedSet.delete(id)
  }

  tracked(): readonly QuestState[] {
    return [...this.trackedSet].sort().map((id) => this.state(id)).filter((state): state is QuestState => state !== null)
  }

  state(id: string): QuestState | null {
    const def = this.defs.get(id)
    if (def === undefined) {
      return null
    }
    return this.exportState(this.ensure(def))
  }

  serialize(): Readonly<Record<string, QuestState>> {
    return Object.fromEntries(this.order.map((id) => [id, this.exportState(this.ensure(this.defs.get(id) as QuestDef))]))
  }

  restore(state: Readonly<Record<string, QuestState>>): void {
    this.states.clear()
    for (const [id, value] of Object.entries(state)) {
      const def = this.defs.get(id)
      if (def === undefined) {
        throw new Error(`state references unknown quest ${id}`)
      }
      const restored = freshState()
      restored.status = value.status
      restored.acceptedTick = value.acceptedTick
      restored.completedTick = value.completedTick
      restored.dayTurnedIn = value.dayTurnedIn
      for (const [objective, progress] of Object.entries(value.progress)) {
        restored.progress.set(objective, { count: progress.count, seen: new Set(progress.seen) })
      }
      this.states.set(id, restored)
    }
  }

  private ensure(def: QuestDef): MutableQuestState {
    let state = this.states.get(def.id)
    if (state === undefined) {
      state = freshState()
      this.states.set(def.id, state)
    }
    return state
  }

  private availableFrom(def: QuestDef, state: MutableQuestState): boolean {
    if (state.status === 'active' || state.status === 'completed') {
      return false
    }
    if (state.status === 'failed') {
      return false
    }
    if (def.repeat === 'repeatable' && state.status === 'available') {
      return true
    }
    if (def.repeat === 'daily') {
      if (state.dayTurnedIn !== null && state.dayTurnedIn >= this.day) {
        return false
      }
    }
    if (state.status === 'turnedIn' && def.repeat !== 'repeatable' && def.repeat !== 'daily') {
      return false
    }
    const prerequisites = [...(def.prerequisites ?? [])]
    if (def.chain !== undefined && !prerequisites.includes(def.chain)) {
      prerequisites.push(def.chain)
    }
    return prerequisites.every((id) => this.status(id) === 'turnedIn')
  }

  private exportState(state: MutableQuestState): QuestState {
    const progress: Record<string, QuestObjectiveState> = {}
    for (const [objective, value] of [...state.progress.entries()].sort(([left], [right]) => left < right ? -1 : 1)) {
      progress[objective] = { count: value.count, seen: [...value.seen].sort() }
    }
    return {
      status: state.status,
      progress,
      acceptedTick: state.acceptedTick,
      completedTick: state.completedTick,
      dayTurnedIn: state.dayTurnedIn,
    }
  }
}
