import { describe, expect, it } from 'vitest'
import { QuestLog, escortProgress, type QuestDef, type QuestObjective } from '../index.js'

const quests: readonly QuestDef[] = [
  {
    id: 'a',
    objectives: [{ id: 'kill', type: 'kill', target: 'slime', required: 2 }],
    rewards: [{ id: 'gold', amount: 5 }],
  },
  {
    id: 'b',
    chain: 'a',
    objectives: [{ id: 'talk', type: 'talk', target: 'elder', required: 1 }],
  },
  {
    id: 'daily',
    repeat: 'daily',
    objectives: [{ id: 'reach', type: 'reach', target: 'camp', required: 1 }],
  },
  {
    id: 'repeat',
    repeat: 'repeatable',
    objectives: [{ id: 'use', type: 'use', target: 'lever', required: 1 }],
  },
  {
    id: 'unique',
    objectives: [{ id: 'collect', type: 'collect', target: 'gem', required: 2, unique: true }],
  },
  {
    id: 'escort',
    objectives: [{
      id: 'escort',
      type: 'escort',
      target: 'escort-target',
      escortId: 'refugee',
      required: 1,
      destination: { x: 10, y: 0 },
      radius: 2,
    }],
  },
  {
    id: 'weekly',
    repeat: 'weekly',
    objectives: [{ id: 'reach', type: 'reach', target: 'shrine', required: 1 }],
  },
]

describe('quest log', () => {
  it('drives objectives, completion, rewards and chained availability', () => {
    const log = new QuestLog({ quests })
    expect(log.available('a')).toBe(true)
    expect(log.available('b')).toBe(false)
    expect(log.accept('a', 1)).toBe(true)
    expect(log.record({ type: 'kill', target: 'slime' }, 2)).toHaveLength(1)
    const updates = log.record({ type: 'kill', target: 'slime', amount: 1 }, 3)
    expect(updates[0]?.completed).toBe(true)
    expect(log.status('a')).toBe('completed')
    expect(log.available('b')).toBe(false)
    const turnIn = log.turnIn('a')
    expect(turnIn).toEqual({ ok: true, rewards: [{ id: 'gold', amount: 5 }] })
    expect(log.status('a')).toBe('turnedIn')
    expect(log.available('b')).toBe(true)
    expect(log.accept('b', 4)).toBe(true)
    expect(log.record({ type: 'talk', target: 'elder' }, 5)[0]?.completed).toBe(true)
  })

  it('handles unique keys, tracking, failure and repeat modes', () => {
    const log = new QuestLog({ quests, worldDayIndex: 0 })
    log.accept('unique', 0)
    log.record({ type: 'collect', target: 'gem', uniqueKey: 'g1' }, 1)
    log.record({ type: 'collect', target: 'gem', uniqueKey: 'g1' }, 2)
    expect(log.state('unique')?.progress.collect?.count).toBe(1)
    log.record({ type: 'collect', target: 'gem', uniqueKey: 'g2' }, 3)
    expect(log.status('unique')).toBe('completed')
    expect(log.track('unique')).toBe(true)
    expect(log.tracked()).toHaveLength(1)

    log.accept('daily', 0)
    log.record({ type: 'reach', target: 'camp' }, 1)
    expect(log.turnIn('daily').ok).toBe(true)
    expect(log.available('daily')).toBe(false)
    log.setWorldDayIndex(1)
    expect(log.available('daily')).toBe(true)

    log.accept('repeat', 0)
    log.record({ type: 'use', target: 'lever' }, 1)
    expect(log.turnIn('repeat').ok).toBe(true)
    expect(log.available('repeat')).toBe(true)
    expect(log.accept('repeat', 2)).toBe(true)
    expect(log.status('repeat')).toBe('active')

    expect(log.fail('repeat')).toBe(true)
    expect(log.status('repeat')).toBe('failed')
    expect(log.fail('missing')).toBe(false)
  })

  it('serializes tracked/day and restores progress without duplicating tracking', () => {
    const log = new QuestLog({ quests, worldDayIndex: 3 })
    log.accept('a', 10)
    log.record({ type: 'kill', target: 'slime' }, 11)
    log.accept('daily', 10)
    log.record({ type: 'reach', target: 'camp' }, 11)
    log.turnIn('daily')
    log.track('a')
    const snapshot = JSON.parse(JSON.stringify(log.serialize()))
    expect(snapshot.worldDayIndex).toBe(3)
    expect(snapshot.tracked).toEqual(['a'])
    const restored = new QuestLog({ quests })
    restored.restore(snapshot)
    expect(restored.worldDayIndex).toBe(3)
    expect(restored.state('a')).toEqual(log.state('a'))
    expect(restored.available('daily')).toBe(false)
    restored.restore(snapshot)
    expect(restored.tracked()).toHaveLength(1)
    restored.setWorldDayIndex(4)
    expect(restored.available('daily')).toBe(true)
  })

  it('evaluates escort progress purely from position and alive state', () => {
    const objective = quests.find((quest) => quest.id === 'escort')?.objectives[0] as QuestObjective
    expect(escortProgress(objective, { x: 10, y: 0, alive: true })).toEqual({
      status: 'arrived',
      distance: 0,
    })
    expect(escortProgress(objective, { x: 10, y: 2, alive: true })).toEqual({
      status: 'arrived',
      distance: 2,
    })
    expect(escortProgress(objective, { x: 10, y: 2.5, alive: true })).toEqual({
      status: 'active',
      distance: 2.5,
    })
    expect(escortProgress(objective, { x: 10, y: 0, alive: false })).toEqual({
      status: 'failed',
      distance: 0,
    })
    expect(() => escortProgress(objective, { x: Number.NaN, y: 0, alive: true })).toThrow(/finite/)
  })

  it('completes escort quests on arrival and fails when the escort dies', () => {
    const log = new QuestLog({ quests })
    expect(log.accept('escort', 1)).toBe(true)
    expect(log.recordEscort('refugee', { x: 0, y: 0, alive: true }, 2)).toEqual([])
    expect(log.status('escort')).toBe('active')
    const arrived = log.recordEscort('refugee', { x: 10, y: 0, alive: true }, 3)
    expect(arrived).toEqual([{ quest: 'escort', objective: 'escort', count: 1, completed: true }])
    expect(log.status('escort')).toBe('completed')
    expect(log.recordEscort('refugee', { x: 0, y: 0, alive: true }, 4)).toEqual([])
    expect(log.status('escort')).toBe('completed')

    const failed = new QuestLog({ quests })
    failed.accept('escort', 1)
    expect(failed.recordEscort('refugee', { x: 4, y: 0, alive: false }, 2)).toEqual([
      { quest: 'escort', objective: 'escort', count: 0, completed: false, failed: true },
    ])
    expect(failed.status('escort')).toBe('failed')
    expect(failed.accept('escort', 3)).toBe(false)
  })

  it('resets weekly quests from an injected tick length and restores weekly state', () => {
    const log = new QuestLog({ quests, weekLengthTicks: 100, tick: 0 })
    expect(log.worldWeekIndex).toBe(0)
    log.accept('weekly', 1)
    log.record({ type: 'reach', target: 'shrine' }, 2)
    expect(log.turnIn('weekly').ok).toBe(true)
    expect(log.available('weekly')).toBe(false)
    log.setTick(99)
    expect(log.worldWeekIndex).toBe(0)
    expect(log.available('weekly')).toBe(false)
    log.setTick(100)
    expect(log.worldWeekIndex).toBe(1)
    expect(log.available('weekly')).toBe(true)

    log.accept('weekly', 101)
    log.record({ type: 'reach', target: 'shrine' }, 102)
    expect(log.turnIn('weekly').ok).toBe(true)
    const snapshot = JSON.parse(JSON.stringify(log.serialize()))
    expect(snapshot.worldWeekIndex).toBe(1)
    expect(snapshot.quests.weekly.weekTurnedIn).toBe(1)
    const restored = new QuestLog({ quests, weekLengthTicks: 100 })
    restored.restore(snapshot)
    expect(restored.worldWeekIndex).toBe(1)
    expect(restored.available('weekly')).toBe(false)
    restored.setTick(200)
    expect(restored.worldWeekIndex).toBe(2)
    expect(restored.available('weekly')).toBe(true)
    expect(() => new QuestLog({ quests }).setTick(100)).toThrow(/weekLengthTicks/)
  })

  it('rejects unknown quests/objectives in snapshots', () => {
    const log = new QuestLog({ quests })
    expect(() => log.restore({
      version: 1,
      worldDayIndex: 0,
      tracked: [],
      quests: {
        missing: { status: 'available', progress: {}, acceptedTick: null, completedTick: null, dayTurnedIn: null },
      },
    })).toThrow(/unknown quest/)
    expect(() => log.restore({
      version: 1,
      worldDayIndex: 0,
      tracked: [],
      quests: {
        a: {
          status: 'active',
          progress: { missing: { count: 1, seen: [] } },
          acceptedTick: 1,
          completedTick: null,
          dayTurnedIn: null,
        },
      },
    })).toThrow(/unknown objective/)
  })
})
