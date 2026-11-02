import type { WorldSnapshot } from '@lunego/core'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface BrowserSaveStore {
  save(snapshot: WorldSnapshot): void
  load(): WorldSnapshot | null
  clear(): void
}

interface StorageGlobal {
  readonly localStorage?: StorageLike
}

export function createBrowserSaveStore(
  key: string,
  storage: StorageLike | undefined = (globalThis as StorageGlobal).localStorage,
): BrowserSaveStore {
  if (key.length === 0) {
    throw new Error('save key must not be empty')
  }
  if (storage === undefined) {
    throw new Error('localStorage is unavailable; inject a StorageLike')
  }
  return {
    save: (snapshot) => {
      storage.setItem(key, JSON.stringify(snapshot))
    },
    load: () => {
      const raw = storage.getItem(key)
      if (raw === null) {
        return null
      }
      try {
        return JSON.parse(raw) as WorldSnapshot
      } catch {
        return null
      }
    },
    clear: () => storage.removeItem(key),
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
