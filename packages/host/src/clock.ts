export interface WorldClockOptions {
  /** Ticks per in-game day. Must be a positive integer. */
  readonly ticksPerDay: number
  /** Days per week; defaults to 7. */
  readonly daysPerWeek?: number
  /** Days per season; defaults to 28. */
  readonly daysPerSeason?: number
  /** Seasons per year; defaults to 4. */
  readonly seasonsPerYear?: number
  /** Calendar day number at tick 0; defaults to 0. */
  readonly startDay?: number
}

const DEFAULT_DAYS_PER_WEEK = 7
const DEFAULT_DAYS_PER_SEASON = 28
const DEFAULT_SEASONS_PER_YEAR = 4

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer`)
  }
  return value
}

function nonNegativeTick(tick: number): number {
  if (!Number.isInteger(tick) || tick < 0) {
    throw new RangeError('tick must be a non-negative integer')
  }
  return tick
}

function modulo(value: number, divisor: number): number {
  const result = value % divisor
  return result < 0 ? result + divisor : result
}

/**
 * Derives calendar positions and reset boundaries from the simulation tick.
 * Never reads the wall clock, so pausing, speeding up and replaying produce
 * exactly the same days and weeks.
 */
export class WorldClock {
  readonly ticksPerDay: number
  readonly daysPerWeek: number
  readonly daysPerSeason: number
  readonly seasonsPerYear: number
  readonly startDay: number

  constructor(options: WorldClockOptions) {
    this.ticksPerDay = positiveInteger(options.ticksPerDay, 'ticksPerDay')
    this.daysPerWeek = positiveInteger(
      options.daysPerWeek ?? DEFAULT_DAYS_PER_WEEK,
      'daysPerWeek',
    )
    this.daysPerSeason = positiveInteger(
      options.daysPerSeason ?? DEFAULT_DAYS_PER_SEASON,
      'daysPerSeason',
    )
    this.seasonsPerYear = positiveInteger(
      options.seasonsPerYear ?? DEFAULT_SEASONS_PER_YEAR,
      'seasonsPerYear',
    )
    this.startDay = options.startDay ?? 0
    if (!Number.isInteger(this.startDay)) {
      throw new RangeError('startDay must be an integer')
    }
  }

  /** Calendar day, shifted by `startDay`. */
  dayIndex(tick: number): number {
    return Math.floor(nonNegativeTick(tick) / this.ticksPerDay) + this.startDay
  }

  weekIndex(tick: number): number {
    return Math.floor(this.dayIndex(tick) / this.daysPerWeek)
  }

  dayOfWeek(tick: number): number {
    return modulo(this.dayIndex(tick), this.daysPerWeek)
  }

  tickInDay(tick: number): number {
    return nonNegativeTick(tick) % this.ticksPerDay
  }

  dayProgress(tick: number): number {
    return this.tickInDay(tick) / this.ticksPerDay
  }

  /** True at the exact tick that starts a day, including tick 0. */
  isDailyReset(tick: number): boolean {
    return this.tickInDay(tick) === 0
  }

  isWeeklyReset(tick: number): boolean {
    return this.isDailyReset(tick) && this.dayOfWeek(tick) === 0
  }

  /** First day boundary strictly after `tick`. */
  nextDailyReset(tick: number): number {
    const current = nonNegativeTick(tick)
    return (Math.floor(current / this.ticksPerDay) + 1) * this.ticksPerDay
  }

  /** First week boundary strictly after `tick`. */
  nextWeeklyReset(tick: number): number {
    return this.nextPeriodReset(nonNegativeTick(tick), this.daysPerWeek)
  }

  crossedDailyReset(fromTick: number, toTick: number): boolean {
    return this.dayIndex(toTick) > this.dayIndex(fromTick)
  }

  crossedWeeklyReset(fromTick: number, toTick: number): boolean {
    return this.weekIndex(toTick) > this.weekIndex(fromTick)
  }

  /** Day boundary ticks in `(fromTick, toTick]`. */
  dailyResetsBetween(fromTick: number, toTick: number): readonly number[] {
    return this.periodResetsBetween(fromTick, toTick, this.ticksPerDay, (tick) =>
      this.nextDailyReset(tick),
    )
  }

  /** Week boundary ticks in `(fromTick, toTick]`. */
  weeklyResetsBetween(fromTick: number, toTick: number): readonly number[] {
    return this.periodResetsBetween(
      fromTick,
      toTick,
      this.daysPerWeek * this.ticksPerDay,
      (tick) => this.nextWeeklyReset(tick),
    )
  }

  protected nextPeriodReset(tick: number, periodDays: number): number {
    const current = nonNegativeTick(tick)
    const days = periodDays - modulo(this.dayIndex(current), periodDays)
    return current - this.tickInDay(current) + days * this.ticksPerDay
  }

  private periodResetsBetween(
    fromTick: number,
    toTick: number,
    periodTicks: number,
    next: (tick: number) => number,
  ): readonly number[] {
    const from = nonNegativeTick(fromTick)
    const to = nonNegativeTick(toTick)
    const result: number[] = []
    if (to < from) {
      return result
    }
    let boundary = next(from)
    while (boundary <= to) {
      result.push(boundary)
      boundary += periodTicks
    }
    return result
  }
}

/** World calendar plus season/year positions and their reset boundaries. */
export class SeasonClock extends WorldClock {
  get daysPerYear(): number {
    return this.daysPerSeason * this.seasonsPerYear
  }

  seasonIndex(tick: number): number {
    return Math.floor(this.dayIndex(tick) / this.daysPerSeason)
  }

  dayOfSeason(tick: number): number {
    return modulo(this.dayIndex(tick), this.daysPerSeason)
  }

  seasonOfYear(tick: number): number {
    return modulo(this.seasonIndex(tick), this.seasonsPerYear)
  }

  yearIndex(tick: number): number {
    return Math.floor(this.seasonIndex(tick) / this.seasonsPerYear)
  }

  seasonProgress(tick: number): number {
    return (this.dayOfSeason(tick) + this.dayProgress(tick)) / this.daysPerSeason
  }

  isSeasonReset(tick: number): boolean {
    return this.isDailyReset(tick) && this.dayOfSeason(tick) === 0
  }

  isYearReset(tick: number): boolean {
    return this.isDailyReset(tick) && this.dayOfSeason(tick) === 0 && this.seasonOfYear(tick) === 0
  }

  nextSeasonReset(tick: number): number {
    return this.nextPeriodReset(tick, this.daysPerSeason)
  }

  nextYearReset(tick: number): number {
    return this.nextPeriodReset(tick, this.daysPerYear)
  }
}
