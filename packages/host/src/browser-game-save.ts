import type { WorldSnapshot } from '@lunego/core'
import { BrowserSaveError, type StorageLike } from './browser.js'
import type { GameSave } from './types.js'

export interface BrowserGameSaveStore {
  save(save: GameSave): void
  load(): GameSave | null
  clear(): void
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSnapshot(value: unknown, scope: 'world' | 'profile'): value is WorldSnapshot {
  return record(value) && value['scope'] === scope &&
    Number.isInteger(value['tick']) && Number.isInteger(value['schemaVersion']) &&
    Number.isInteger(value['formatVersion']) && Number.isInteger(value['nextSeq']) &&
    typeof value['contentHash'] === 'string' && typeof value['dt'] === 'number' &&
    record(value['components']) && record(value['models']) && record(value['entities']) &&
    record(value['states']) && record(value['rng']) &&
    Array.isArray(value['pendingCommands']) && Array.isArray(value['previousEvents'])
}

function pair(value: unknown): GameSave {
  if (!record(value)) throw new BrowserSaveError('save_corrupt', 'invalid paired save')
  const world = value['world']
  const profile = value['profile']
  if (!isSnapshot(world, 'world') || !isSnapshot(profile, 'profile')) {
    throw new BrowserSaveError('save_corrupt', 'invalid world or profile snapshot')
  }
  if (world.tick !== profile.tick || world.schemaVersion !== profile.schemaVersion ||
    world.contentHash !== profile.contentHash || world.dt !== profile.dt) {
    throw new BrowserSaveError('save_corrupt', 'world and profile must share the same tick, schema and content')
  }
  return { world, profile }
}

/** Persist the two scopes as one storage value so failed writes cannot mix runs. */
export function createBrowserGameSaveStore(
  key: string,
  storage: StorageLike | undefined = (globalThis as { readonly localStorage?: StorageLike }).localStorage,
): BrowserGameSaveStore {
  if (key.length === 0) throw new Error('save key must not be empty')
  if (storage === undefined) throw new Error('localStorage is unavailable; inject a StorageLike')
  const backupKey = `${key}.bak`
  return {
    save: (save) => {
      const serialized = JSON.stringify(pair(save))
      try {
        storage.setItem(key, serialized)
        storage.setItem(backupKey, serialized)
      } catch (error) {
        throw new BrowserSaveError('save_failed', `failed to write paired save ${key}`, error)
      }
    },
    load: () => {
      let failure: unknown
      for (const candidate of [key, backupKey]) {
        const raw = storage.getItem(candidate)
        if (raw === null) continue
        try { return pair(JSON.parse(raw)) } catch (error) { failure = error }
      }
      if (failure !== undefined) throw new BrowserSaveError('save_corrupt', 'paired save and backup are corrupt', failure)
      return null
    },
    clear: () => {
      storage.removeItem(key)
      storage.removeItem(backupKey)
    },
  }
}
