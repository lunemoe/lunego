import type { WorldSnapshot } from '@lunego/core'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface BrowserSaveStore {
  save(snapshot: WorldSnapshot): void
  load(): WorldSnapshot | null
  export(): string
  import(serialized: string): WorldSnapshot
  persist(): Promise<boolean>
  clear(): void
}

export class BrowserSaveError extends Error {
  readonly code: string

  constructor(code: string, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'BrowserSaveError'
    this.code = code
  }
}

interface StorageGlobal {
  readonly localStorage?: StorageLike
  readonly navigator?: {
    readonly storage?: {
      persist?: () => Promise<boolean>
    }
  }
}

function parseSnapshot(raw: string, source: string): WorldSnapshot {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new BrowserSaveError('save_corrupt', `${source} is not valid JSON`, error)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new BrowserSaveError('save_corrupt', `${source} is not a snapshot object`)
  }
  return parsed as WorldSnapshot
}

export function createBrowserSaveStore(
  key: string,
  storage: StorageLike | undefined = (globalThis as StorageGlobal).localStorage,
  persistence: StorageGlobal['navigator'] = (globalThis as StorageGlobal).navigator,
): BrowserSaveStore {
  if (key.length === 0) {
    throw new Error('save key must not be empty')
  }
  if (storage === undefined) {
    throw new Error('localStorage is unavailable; inject a StorageLike')
  }
  const backupKey = `${key}.bak`
  const load = (): WorldSnapshot | null => {
    const primary = storage.getItem(key)
    if (primary !== null) {
      try {
        return parseSnapshot(primary, key)
      } catch (primaryError) {
        const backup = storage.getItem(backupKey)
        if (backup !== null) {
          try {
            return parseSnapshot(backup, backupKey)
          } catch (backupError) {
            throw new BrowserSaveError(
              'save_corrupt',
              `both ${key} and ${backupKey} are corrupt`,
              backupError,
            )
          }
        }
        throw primaryError
      }
    }
    const backup = storage.getItem(backupKey)
    return backup === null ? null : parseSnapshot(backup, backupKey)
  }
  return {
    save: (snapshot) => {
      const serialized = JSON.stringify(snapshot)
      try {
        storage.setItem(key, serialized)
        storage.setItem(backupKey, serialized)
      } catch (error) {
        throw new BrowserSaveError('save_failed', `failed to write save ${key}`, error)
      }
    },
    load,
    export: () => {
      const snapshot = load()
      if (snapshot === null) {
        throw new BrowserSaveError('save_missing', `no save exists at ${key}`)
      }
      return JSON.stringify(snapshot)
    },
    import: (serialized) => parseSnapshot(serialized, 'imported save'),
    persist: async () => {
      if (persistence?.storage?.persist === undefined) {
        return false
      }
      try {
        return await persistence.storage.persist()
      } catch (error) {
        throw new BrowserSaveError('persist_failed', 'storage persistence request failed', error)
      }
    },
    clear: () => {
      try {
        storage.removeItem(key)
        storage.removeItem(backupKey)
      } catch (error) {
        throw new BrowserSaveError('save_failed', `failed to clear save ${key}`, error)
      }
    },
  }
}

export interface BrowserKeyEvent {
  readonly code: string
  readonly repeat?: boolean
  preventDefault?: () => void
}

export interface BrowserKeyTarget {
  addEventListener(type: 'keydown', listener: (event: BrowserKeyEvent) => void): void
  removeEventListener(type: 'keydown', listener: (event: BrowserKeyEvent) => void): void
}

interface KeyGlobal {
  readonly addEventListener?: BrowserKeyTarget['addEventListener']
  readonly removeEventListener?: BrowserKeyTarget['removeEventListener']
}

export function bindBrowserKeys(
  bindings: Readonly<Record<string, () => void>>,
  target?: BrowserKeyTarget,
): () => void {
  const global = globalThis as KeyGlobal
  const resolved: BrowserKeyTarget = target ?? {
    addEventListener: (type, listener) => {
      if (global.addEventListener === undefined) {
        throw new Error('keyboard target is unavailable; inject a BrowserKeyTarget')
      }
      global.addEventListener(type, listener)
    },
    removeEventListener: (type, listener) => {
      global.removeEventListener?.(type, listener)
    },
  }
  const handler = (event: BrowserKeyEvent): void => {
    if (event.repeat === true) {
      return
    }
    const action = bindings[event.code]
    if (action !== undefined) {
      event.preventDefault?.()
      action()
    }
  }
  resolved.addEventListener('keydown', handler)
  return () => resolved.removeEventListener('keydown', handler)
}

interface DebugGlobal {
  [key: string]: unknown
}

/** Expose a read-only debug handle from browser entry points. */
export function exposeBrowserDebug(name: string, value: unknown): () => void {
  const global = globalThis as DebugGlobal
  global[name] = value
  return () => {
    delete global[name]
  }
}

interface LocationGlobal {
  readonly location?: { readonly search: string; reload(): void }
}

/** Read a URL query parameter without exposing window.location to games. */
export function readBrowserParam(name: string): string | null {
  const location = (globalThis as LocationGlobal).location
  if (location === undefined) {
    return null
  }
  const query = location.search.startsWith('?') ? location.search.slice(1) : location.search
  for (const pair of query.split('&')) {
    const separator = pair.indexOf('=')
    const key = separator < 0 ? pair : pair.slice(0, separator)
    if (decodeURIComponent(key) === name) {
      return separator < 0 ? '' : decodeURIComponent(pair.slice(separator + 1))
    }
  }
  return null
}

export function reloadBrowserPage(): void {
  ;(globalThis as LocationGlobal).location?.reload()
}
