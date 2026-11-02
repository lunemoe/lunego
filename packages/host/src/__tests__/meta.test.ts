import { describe, expect, it } from 'vitest'
import { defineFeature } from '@lunego/core'
import {
  LocalLeaderboard,
  SeasonClock,
  WorldClock,
  createGame,
  createMemoryProfileStorage,
  profileLeaderboardStorage,
  type LeaderboardStorage,
} from '../index.js'

describe('WorldClock and SeasonClock', () => {
  it('derives days and weeks from ticks', () => {
    const clock = new WorldClock({ ticksPerDay: 24 })
    expect(clock.dayIndex(0)).toBe(0)
    expect(clock.dayIndex(23)).toBe(0)
    expect(clock.dayIndex(24)).toBe(1)
    expect(clock.dayOfWeek(0)).toBe(0)
    expect(clock.weekIndex(24 * 7 - 1)).toBe(0)
    expect(clock.weekIndex(24 * 7)).toBe(1)
    expect(clock.dayOfWeek(24 * 7)).toBe(0)
    expect(clock.tickInDay(25)).toBe(1)
    expect(clock.dayProgress(12)).toBe(0.5)
  })

  it('reports daily and weekly reset boundaries', () => {
    const clock = new WorldClock({ ticksPerDay: 24 })
    expect(clock.nextDailyReset(0)).toBe(24)
    expect(clock.nextDailyReset(23)).toBe(24)
    expect(clock.nextDailyReset(24)).toBe(48)
    expect(clock.nextWeeklyReset(0)).toBe(168)
    expect(clock.nextWeeklyReset(167)).toBe(168)
    expect(clock.nextWeeklyReset(168)).toBe(336)
    expect(clock.dailyResetsBetween(0, 72)).toEqual([24, 48, 72])
    expect(clock.dailyResetsBetween(24, 24)).toEqual([])
    expect(clock.weeklyResetsBetween(0, 400)).toEqual([168, 336])
    expect(clock.crossedDailyReset(23, 24)).toBe(true)
    expect(clock.crossedDailyReset(24, 24)).toBe(false)
    expect(clock.crossedWeeklyReset(167, 168)).toBe(true)
    expect(clock.isDailyReset(24)).toBe(true)
    expect(clock.isWeeklyReset(168)).toBe(true)
  })

  it('supports a shifted calendar start', () => {
    const clock = new WorldClock({ ticksPerDay: 10, startDay: 3 })
    expect(clock.dayIndex(0)).toBe(3)
    expect(clock.dayOfWeek(0)).toBe(3)
    expect(clock.weekIndex(0)).toBe(0)
    expect(clock.nextWeeklyReset(0)).toBe(40)
    expect(clock.dayOfWeek(40)).toBe(0)
  })

  it('adds seasons and years on top of the day/week clock', () => {
    const clock = new SeasonClock({
      ticksPerDay: 10,
      daysPerWeek: 7,
      daysPerSeason: 28,
      seasonsPerYear: 4,
    })
    expect(clock.daysPerYear).toBe(112)
    expect(clock.seasonIndex(0)).toBe(0)
    expect(clock.seasonIndex(28 * 10)).toBe(1)
    expect(clock.dayOfSeason(15 * 10)).toBe(15)
    expect(clock.seasonOfYear(28 * 4 * 10)).toBe(0)
    expect(clock.yearIndex(28 * 4 * 10)).toBe(1)
    expect(clock.nextSeasonReset(0)).toBe(280)
    expect(clock.nextYearReset(0)).toBe(1120)
    expect(clock.isSeasonReset(280)).toBe(true)
    expect(clock.isYearReset(1120)).toBe(true)
  })

  it('stays fixed while paused and advances with speed changes', () => {
    const empty = defineFeature({ name: 'clock-fixture' })
    const game = createGame({ features: [empty], dt: 1, maxCatchUp: 10 })
    const clock = new WorldClock({ ticksPerDay: 2 })

    expect(game.update(1)).toBe(1)
    expect(game.tick).toBe(1)
    expect(clock.dayIndex(game.tick)).toBe(0)
    game.pause()
    expect(game.update(10)).toBe(0)
    expect(game.tick).toBe(1)
    expect(clock.dayIndex(game.tick)).toBe(0)
    game.resume()
    game.setSpeed(2)
    expect(game.update(1)).toBe(2)
    expect(game.tick).toBe(3)
    expect(clock.dayIndex(game.tick)).toBe(1)
    expect(clock.crossedDailyReset(1, game.tick)).toBe(true)
  })
})

describe('LocalLeaderboard', () => {
  it('orders by score, tick and character id deterministically', () => {
    const board = new LocalLeaderboard()
    board.submit({ characterId: 'b', score: 100, tick: 10 })
    board.submit({ characterId: 'a', score: 100, tick: 10 })
    board.submit({ characterId: 'c', score: 100, tick: 5 })
    board.submit({ characterId: 'd', score: 200, tick: 20 })
    expect(board.top(10).map((entry) => entry.characterId)).toEqual(['d', 'c', 'a', 'b'])
    expect(board.rank('c')).toBe(2)
    expect(board.rank('missing')).toBeNull()
    expect(board.size).toBe(4)
  })

  it('keeps only the best entry per character', () => {
    const board = new LocalLeaderboard()
    const better = board.submit({ characterId: 'a', score: 100, tick: 10 })
    expect(board.submit({ characterId: 'a', score: 90, tick: 11 })).toEqual(better)
    expect(board.submit({ characterId: 'a', score: 100, tick: 12 })).toEqual(better)
    expect(board.size).toBe(1)
    const replaced = board.submit({ characterId: 'a', score: 150, tick: 15 })
    expect(replaced).toMatchObject({ score: 150, tick: 15 })
    expect(board.entry('a')).toEqual(replaced)
  })

  it('filters queries and keeps an opaque JSON payload', () => {
    const board = new LocalLeaderboard()
    const payload = { kills: 3 }
    board.submit({ characterId: 'a', score: 100, tick: 10, data: payload })
    board.submit({ characterId: 'b', score: 50, tick: 20 })
    board.submit({ characterId: 'c', score: 75, tick: 30 })
    payload.kills = 99
    expect(board.entry('a')?.data).toEqual({ kills: 3 })
    expect(board.query({ minScore: 60 }).map((entry) => entry.characterId)).toEqual([
      'a',
      'c',
    ])
    expect(board.query({ sinceTick: 20 }).map((entry) => entry.characterId)).toEqual([
      'c',
      'b',
    ])
    expect(board.query({ untilTick: 20 }).map((entry) => entry.characterId)).toEqual([
      'a',
      'b',
    ])
    expect(board.top(1).map((entry) => entry.characterId)).toEqual(['a'])
  })

  it('persists through an injected storage port', () => {
    const values = new Map<string, string>()
    const storage: LeaderboardStorage = {
      read: () => values.get('board') ?? null,
      write: (value) => values.set('board', value),
    }
    const board = new LocalLeaderboard({ storage })
    board.submit({ characterId: 'a', score: 10, tick: 1 })
    board.submit({ characterId: 'b', score: 20, tick: 2 })
    const reloaded = new LocalLeaderboard({ storage })
    expect(reloaded.entries()).toEqual([
      { characterId: 'b', score: 20, tick: 2 },
      { characterId: 'a', score: 10, tick: 1 },
    ])
    reloaded.remove('b')
    expect(new LocalLeaderboard({ storage }).top(1)).toEqual([
      { characterId: 'a', score: 10, tick: 1 },
    ])
  })

  it('persists per profile character and rejects corrupt data', () => {
    const profileStorage = createMemoryProfileStorage()
    const storage = profileLeaderboardStorage(profileStorage, 'acc', 'alpha')
    const board = new LocalLeaderboard({ storage })
    board.submit({ characterId: 'a', score: 5, tick: 1 })
    const restored = new LocalLeaderboard({ storage })
    expect(restored.top(1)[0]).toMatchObject({ characterId: 'a', score: 5 })
    expect(profileStorage.keys()).toContain(
      'lunego.profile/accounts/acc/leaderboards/alpha',
    )

    const corrupt = createMemoryProfileStorage({
      'lunego.profile/accounts/acc/leaderboards/beta': '{bad',
    })
    expect(
      () =>
        new LocalLeaderboard({
          storage: profileLeaderboardStorage(corrupt, 'acc', 'beta'),
        }),
    ).toThrow(expect.objectContaining({ code: 'leaderboard_corrupt' }))
  })

  it('keeps the old ranking when persistence fails', () => {
    const storage: LeaderboardStorage = {
      read: () => null,
      write: () => {
        throw new Error('quota exceeded')
      },
    }
    const board = new LocalLeaderboard({ storage })
    expect(() => board.submit({ characterId: 'a', score: 1, tick: 1 })).toThrow(
      expect.objectContaining({ code: 'leaderboard_storage' }),
    )
    expect(board.size).toBe(0)
  })

  it('limits the retained entries and validates inputs', () => {
    const board = new LocalLeaderboard({ limit: 2 })
    board.submit({ characterId: 'a', score: 10, tick: 1 })
    board.submit({ characterId: 'b', score: 30, tick: 2 })
    board.submit({ characterId: 'c', score: 20, tick: 3 })
    expect(board.entries().map((entry) => entry.characterId)).toEqual(['b', 'c'])
    expect(() => board.submit({ characterId: '', score: 1, tick: 1 })).toThrow(
      expect.objectContaining({ code: 'leaderboard_invalid' }),
    )
    expect(() => board.submit({ characterId: 'a', score: 1, tick: -1 })).toThrow(
      expect.objectContaining({ code: 'leaderboard_invalid' }),
    )
    expect(() => board.submit({ characterId: 'a', score: Number.NaN, tick: 1 })).toThrow(
      expect.objectContaining({ code: 'leaderboard_invalid' }),
    )
    expect(() => board.query({ limit: -1 })).toThrow(
      expect.objectContaining({ code: 'leaderboard_invalid' }),
    )
  })
})
