import { parseQuestLogSnapshot, type QuestLogSnapshot } from './snapshot.js'
import type {
  EscortObservation,
  QuestDef,
  QuestEvent,
  QuestLogOptions,
  QuestObjectiveState,
  QuestState,
  QuestStatus,
  QuestTurnInResult,
  QuestUpdate,
} from './types.js'
import { recordEscortProgress } from './escort.js'
import { freshState, type MutableQuestState } from './state.js'
import { validateQuest } from './validation.js'

/** Event-driven quest state machine; rewards are requests, not mutations. */
export class QuestLog {
  private readonly defs = new Map<string, QuestDef>()
  private readonly order: string[] = []
  private readonly states = new Map<string, MutableQuestState>()
  private readonly trackedSet = new Set<string>()
  readonly weekLengthTicks: number | undefined
  private day: number
  private week: number

  constructor(options: QuestLogOptions) {
    this.day = options.worldDayIndex ?? 0
    if (!Number.isInteger(this.day) || this.day < 0) {
      throw new Error('worldDayIndex must be a non-negative integer')
    }
    if (options.weekLengthTicks !== undefined) {
      if (!Number.isInteger(options.weekLengthTicks) || options.weekLengthTicks < 1) {
        throw new Error('weekLengthTicks must be a positive integer')
      }
      this.weekLengthTicks = options.weekLengthTicks
    } else {
      this.weekLengthTicks = undefined
    }
    let week = options.worldWeekIndex ?? 0
    if (!Number.isInteger(week) || week < 0) {
      throw new Error('worldWeekIndex must be a non-negative integer')
    }
    if (options.tick !== undefined) {
      if (this.weekLengthTicks === undefined) {
        throw new Error('tick requires weekLengthTicks')
      }
      if (!Number.isInteger(options.tick) || options.tick < 0) {
        throw new Error('tick must be a non-negative integer')
      }
      const derived = Math.floor(options.tick / this.weekLengthTicks)
      if (options.worldWeekIndex !== undefined && options.worldWeekIndex !== derived) {
        throw new Error('worldWeekIndex disagrees with tick and weekLengthTicks')
      }
      week = derived
    }
    this.week = week
    for (const def of options.quests) {
      validateQuest(def)
      if (this.defs.has(def.id)) {
        throw new Error(`duplicate quest ${def.id}`)
      }
      this.defs.set(def.id, def)
      this.order.push(def.id)
    }
    this.order.sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
    if (options.state !== undefined) {
      this.restore({
        version: 1,
        worldDayIndex: this.day,
        worldWeekIndex: this.week,
        tracked: [],
        quests: options.state,
      })
    }
  }

  get worldDayIndex(): number {
    return this.day
  }

  get worldWeekIndex(): number {
    return this.week
  }

  setWorldDayIndex(day: number): void {
    if (!Number.isInteger(day) || day < 0) {
      throw new Error('worldDayIndex must be a non-negative integer')
    }
    this.day = day
  }

  setWorldWeekIndex(week: number): void {
    if (!Number.isInteger(week) || week < 0) {
      throw new Error('worldWeekIndex must be a non-negative integer')
    }
    this.week = week
  }

  /** Derives the week from an injected tick; never reads the wall clock. */
  setTick(tick: number): void {
    if (this.weekLengthTicks === undefined) {
      throw new Error('weekLengthTicks must be configured before setTick')
    }
    if (!Number.isInteger(tick) || tick < 0) {
      throw new Error('tick must be a non-negative integer')
    }
    this.week = Math.floor(tick / this.weekLengthTicks)
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
        if (objective.type === 'escort') {
          continue
        }
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

  /** Evaluates an escort objective; outside the radius is still active. */
  recordEscort(
    escortId: string,
    observation: EscortObservation,
    tick: number,
  ): readonly QuestUpdate[] {
    return recordEscortProgress(
      this.defs,
      this.order,
      (def) => this.ensure(def),
      escortId,
      observation,
      tick,
    )
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
    state.weekTurnedIn = this.week
    if (def.repeat === 'repeatable' || def.repeat === 'daily' || def.repeat === 'weekly') {
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

  serialize(): QuestLogSnapshot {
    const quests: Record<string, QuestState> = {}
    for (const id of this.order) {
      const def = this.defs.get(id)
      if (def !== undefined) {
        quests[id] = this.exportState(this.ensure(def))
      }
    }
    return {
      version: 1,
      worldDayIndex: this.day,
      worldWeekIndex: this.week,
      tracked: [...this.trackedSet].sort(),
      quests,
    }
  }

  /** Replaces day, tracking and quest states after validating the snapshot. */
  restore(snapshot: QuestLogSnapshot): void {
    const parsed = parseQuestLogSnapshot(snapshot, this.defs)
    const states = new Map<string, MutableQuestState>()
    for (const [id, value] of parsed.states) {
      const restored = freshState()
      restored.status = value.status
      restored.acceptedTick = value.acceptedTick
      restored.completedTick = value.completedTick
      restored.dayTurnedIn = value.dayTurnedIn
      restored.weekTurnedIn = value.weekTurnedIn ?? null
      for (const [objective, progress] of Object.entries(value.progress)) {
        restored.progress.set(objective, { count: progress.count, seen: new Set(progress.seen) })
      }
      states.set(id, restored)
    }
    this.day = parsed.worldDayIndex
    this.week = parsed.worldWeekIndex
    this.states.clear()
    for (const [id, state] of states) {
      this.states.set(id, state)
    }
    this.trackedSet.clear()
    for (const id of parsed.tracked) {
      this.trackedSet.add(id)
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
    if (def.repeat === 'weekly') {
      if (state.weekTurnedIn !== null && state.weekTurnedIn >= this.week) {
        return false
      }
    }
    if (
      state.status === 'turnedIn' &&
      def.repeat !== 'repeatable' &&
      def.repeat !== 'daily' &&
      def.repeat !== 'weekly'
    ) {
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
      weekTurnedIn: state.weekTurnedIn,
    }
  }
}
