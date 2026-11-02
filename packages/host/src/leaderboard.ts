import { LuneGoError } from '@lunego/core'
import { isRecord } from './guards.js'
import type { ProfileStorage } from './profile-store.js'

export interface LeaderboardEntry {
  readonly characterId: string
  readonly score: number
  /** Simulation tick at submission; used for deterministic tie-breaking. */
  readonly tick: number
  /** Opaque, JSON-serializable game data. */
  readonly data?: unknown
}

export interface LeaderboardState {
  readonly version: typeof LEADERBOARD_STATE_VERSION
  readonly entries: readonly LeaderboardEntry[]
}

export interface LeaderboardStorage {
  read(): string | null
  write(value: string): void
}

export interface LocalLeaderboardOptions {
  readonly storage?: LeaderboardStorage
  readonly state?: LeaderboardState
  /** Keep only the best N entries; unbounded when omitted. */
  readonly limit?: number
}

export interface LeaderboardQuery {
  readonly minScore?: number
  readonly sinceTick?: number
  readonly untilTick?: number
  readonly limit?: number
}

const LEADERBOARD_STATE_VERSION = 1

function invalid(message: string, cause?: unknown): LuneGoError {
  return new LuneGoError(
    'leaderboard_invalid',
    message,
    cause === undefined ? {} : { cause },
  )
}

function cloneJson(value: unknown, where: string): unknown {
  try {
    const serialized = JSON.stringify(value)
    if (serialized === undefined) {
      throw new Error('value is not JSON-serializable')
    }
    return JSON.parse(serialized)
  } catch (error) {
    throw invalid(`${where} must be JSON-serializable`, error)
  }
}

function normalizeEntry(value: unknown): LeaderboardEntry {
  if (!isRecord(value)) {
    throw invalid('leaderboard entry must be an object')
  }
  const characterId = value['characterId']
  if (typeof characterId !== 'string' || characterId.length === 0) {
    throw invalid('leaderboard characterId must be a non-empty string')
  }
  const score = value['score']
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    throw invalid(`leaderboard score for ${characterId} must be a finite number`)
  }
  const tick = value['tick']
  if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0) {
    throw invalid(`leaderboard tick for ${characterId} must be a non-negative integer`)
  }
  const rawData = value['data']
  if (rawData === undefined) {
    return { characterId, score, tick }
  }
  return { characterId, score, tick, data: cloneJson(rawData, `leaderboard data for ${characterId}`) }
}

/** Negative when `left` ranks before `right`; deterministic total order. */
function compareEntries(left: LeaderboardEntry, right: LeaderboardEntry): number {
  if (left.score !== right.score) {
    return right.score - left.score
  }
  if (left.tick !== right.tick) {
    return left.tick - right.tick
  }
  return left.characterId < right.characterId
    ? -1
    : left.characterId > right.characterId
      ? 1
      : 0
}

function normalizeEntries(
  values: readonly unknown[],
  limit: number | null,
): LeaderboardEntry[] {
  const best = new Map<string, LeaderboardEntry>()
  for (const value of values) {
    const entry = normalizeEntry(value)
    const existing = best.get(entry.characterId)
    if (existing === undefined || compareEntries(entry, existing) < 0) {
      best.set(entry.characterId, entry)
    }
  }
  const sorted = [...best.values()].sort(compareEntries)
  return limit === null ? sorted : sorted.slice(0, limit)
}

function stateOf(entries: readonly LeaderboardEntry[]): LeaderboardState {
  return { version: LEADERBOARD_STATE_VERSION, entries }
}

function parseState(serialized: string): LeaderboardState {
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch (error) {
    throw new LuneGoError('leaderboard_corrupt', 'leaderboard data is not valid JSON', {
      cause: error,
    })
  }
  if (!isRecord(parsed) || parsed['version'] !== LEADERBOARD_STATE_VERSION) {
    throw new LuneGoError('leaderboard_corrupt', 'leaderboard data has an unsupported format')
  }
  const entries = parsed['entries']
  if (!Array.isArray(entries)) {
    throw new LuneGoError('leaderboard_corrupt', 'leaderboard entries must be an array')
  }
  try {
    return stateOf(normalizeEntries(entries, null))
  } catch (error) {
    throw new LuneGoError('leaderboard_corrupt', 'leaderboard data is corrupt', { cause: error })
  }
}

/**
 * Deterministic local leaderboard. Ranking is score descending, then tick
 * ascending, then character id. One entry per character; a worse submission
 * never replaces a better one.
 */
export class LocalLeaderboard {
  private readonly storage: LeaderboardStorage | undefined
  private readonly limit: number | null
  private entriesValue: Map<string, LeaderboardEntry>

  constructor(options: LocalLeaderboardOptions = {}) {
    this.storage = options.storage
    const limit = options.limit
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
      throw invalid('leaderboard limit must be a positive integer')
    }
    this.limit = limit ?? null
    let entries: readonly LeaderboardEntry[] = options.state?.entries ?? []
    if (this.storage !== undefined) {
      const raw = this.readStorage()
      if (raw !== null) {
        entries = parseState(raw).entries
      }
    }
    const normalized = normalizeEntries(entries, this.limit)
    this.entriesValue = new Map(normalized.map((entry) => [entry.characterId, entry]))
  }

  get size(): number {
    return this.entriesValue.size
  }

  submit(value: LeaderboardEntry): LeaderboardEntry {
    const candidate = normalizeEntry(value)
    const existing = this.entriesValue.get(candidate.characterId)
    if (existing !== undefined && compareEntries(candidate, existing) >= 0) {
      return existing
    }
    const next = new Map(this.entriesValue)
    next.set(candidate.characterId, candidate)
    const sorted = normalizeEntries([...next.values()], this.limit)
    this.commit(sorted)
    return candidate
  }

  query(options: LeaderboardQuery = {}): readonly LeaderboardEntry[] {
    let result = [...this.entriesValue.values()]
    const minScore = options.minScore
    if (minScore !== undefined) {
      result = result.filter((entry) => entry.score >= minScore)
    }
    const sinceTick = options.sinceTick
    if (sinceTick !== undefined) {
      result = result.filter((entry) => entry.tick >= sinceTick)
    }
    const untilTick = options.untilTick
    if (untilTick !== undefined) {
      result = result.filter((entry) => entry.tick <= untilTick)
    }
    if (options.limit !== undefined) {
      if (!Number.isInteger(options.limit) || options.limit < 0) {
        throw invalid('leaderboard query limit must be a non-negative integer')
      }
      result = result.slice(0, options.limit)
    }
    return result
  }

  top(limit = 10): readonly LeaderboardEntry[] {
    return this.query({ limit })
  }

  rank(characterId: string): number | null {
    let index = 1
    for (const entry of this.entriesValue.values()) {
      if (entry.characterId === characterId) {
        return index
      }
      index += 1
    }
    return null
  }

  entry(characterId: string): LeaderboardEntry | null {
    return this.entriesValue.get(characterId) ?? null
  }

  entries(): readonly LeaderboardEntry[] {
    return [...this.entriesValue.values()]
  }

  remove(characterId: string): boolean {
    if (!this.entriesValue.has(characterId)) {
      return false
    }
    const next = new Map(this.entriesValue)
    next.delete(characterId)
    this.commit(normalizeEntries([...next.values()], this.limit))
    return true
  }

  clear(): void {
    this.commit([])
  }

  toState(): LeaderboardState {
    return stateOf(this.entries())
  }

  serialize(): string {
    return JSON.stringify(this.toState())
  }

  private commit(entries: readonly LeaderboardEntry[]): void {
    const state = stateOf(entries)
    if (this.storage !== undefined) {
      let serialized: string
      try {
        serialized = JSON.stringify(state)
      } catch (error) {
        throw invalid('leaderboard state is not JSON serializable', error)
      }
      try {
        this.storage.write(serialized)
      } catch (error) {
        throw new LuneGoError('leaderboard_storage', 'failed to persist leaderboard', {
          cause: error,
        })
      }
    }
    this.entriesValue = new Map(entries.map((entry) => [entry.characterId, entry]))
  }

  private readStorage(): string | null {
    try {
      return this.storage?.read() ?? null
    } catch (error) {
      throw new LuneGoError('leaderboard_storage', 'failed to read leaderboard', {
        cause: error,
      })
    }
  }
}

/**
 * Builds a leaderboard storage port namespaced to one profile character. The
 * ranking therefore travels with the profile, never with the world save.
 */
export function profileLeaderboardStorage(
  storage: ProfileStorage,
  accountId: string,
  slot: string,
  prefix = 'lunego.profile',
): LeaderboardStorage {
  if (accountId.length === 0 || slot.length === 0 || prefix.length === 0) {
    throw invalid('accountId, slot and prefix must be non-empty')
  }
  const key = `${prefix}/accounts/${encodeURIComponent(accountId)}/leaderboards/${encodeURIComponent(slot)}`
  return {
    read: () => storage.read(key),
    write: (value) => {
      storage.write(key, value)
    },
  }
}
