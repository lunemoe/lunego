import { describe, expect, it } from 'vitest'
import { QuestLog, type QuestDef } from '../index.js'

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

  it('serializes and restores exact progress and repeat day', () => {
    const log = new QuestLog({ quests, worldDayIndex: 3 })
    log.accept('a', 10)
    log.record({ type: 'kill', target: 'slime' }, 11)
    log.accept('daily', 10)
    log.record({ type: 'reach', target: 'camp' }, 11)
    log.turnIn('daily')
    const state = JSON.parse(JSON.stringify(log.serialize()))
    const restored = new QuestLog({ quests, worldDayIndex: 3, state })
    expect(restored.state('a')).toEqual(log.state('a'))
    expect(restored.available('daily')).toBe(false)
    restored.setWorldDayIndex(4)
    expect(restored.available('daily')).toBe(true)
  })
})
