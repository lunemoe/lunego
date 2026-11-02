export type LocaleState = Readonly<{
  readonly locale: string
  readonly fallbackLocale?: string
}>

export interface LocaleStoreOptions {
  readonly version?: number
  readonly defaultLocale: string
  readonly fallbackLocale?: string
  readonly initial?: LocaleState
  readonly migrate?: (fromVersion: number, value: unknown) => LocaleState
}

export interface LocaleEnvelope {
  readonly version: number
  readonly scope: 'profile'
  readonly value: LocaleState
}

export const LOCALE_STORE_VERSION = 1

function cloneState(state: LocaleState): LocaleState {
  return state.fallbackLocale === undefined
    ? { locale: state.locale }
    : { locale: state.locale, fallbackLocale: state.fallbackLocale }
}

function readState(value: unknown): LocaleState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('locale state must be an object')
  }
  const record = value as Record<string, unknown>
  const locale = record['locale']
  if (typeof locale !== 'string' || locale.length === 0) {
    throw new Error('locale state has no locale')
  }
  const fallback = record['fallbackLocale']
  if (fallback !== undefined && typeof fallback !== 'string') {
    throw new Error('locale fallback must be a string')
  }
  return fallback === undefined
    ? { locale }
    : { locale, fallbackLocale: fallback }
}

/**
 * Versioned, profile-scoped locale state with JSON serialization and change
 * events. It never touches DOM, localStorage or the browser's locale.
 */
export class LocaleStore {
  readonly version: number
  readonly scope = 'profile' as const
  private readonly defaults: LocaleState
  private readonly migrate: ((fromVersion: number, value: unknown) => LocaleState) | undefined
  private readonly listeners = new Set<(locale: string) => void>()
  private current: LocaleState

  constructor(options: LocaleStoreOptions) {
    this.version = options.version ?? LOCALE_STORE_VERSION
    if (!Number.isInteger(this.version) || this.version < 1) {
      throw new Error('locale store version must be a positive integer')
    }
    if (options.defaultLocale.length === 0) {
      throw new Error('defaultLocale must not be empty')
    }
    this.defaults = options.fallbackLocale === undefined
      ? { locale: options.defaultLocale }
      : { locale: options.defaultLocale, fallbackLocale: options.fallbackLocale }
    this.current = cloneState(options.initial ?? this.defaults)
    this.migrate = options.migrate
  }

  get value(): LocaleState {
    return cloneState(this.current)
  }

  get locale(): string {
    return this.current.locale
  }

  get fallbackLocale(): string | undefined {
    return this.current.fallbackLocale
  }

  setLocale(locale: string): void {
    if (locale.length === 0) {
      throw new Error('locale must not be empty')
    }
    if (locale === this.current.locale) {
      return
    }
    this.current = this.current.fallbackLocale === undefined
      ? { locale }
      : { locale, fallbackLocale: this.current.fallbackLocale }
    this.notify()
  }

  setFallbackLocale(locale: string | undefined): void {
    this.current = locale === undefined
      ? { locale: this.current.locale }
      : { locale: this.current.locale, fallbackLocale: locale }
  }

  subscribe(listener: (locale: string) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  reset(): void {
    const previous = this.current.locale
    this.current = cloneState(this.defaults)
    if (this.current.locale !== previous) {
      this.notify()
    }
  }

  serialize(): string {
    const envelope: LocaleEnvelope = {
      version: this.version,
      scope: this.scope,
      value: this.value,
    }
    return JSON.stringify(envelope)
  }

  deserialize(serialized: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(serialized)
    } catch (error) {
      throw new Error('locale store JSON is invalid', { cause: error })
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('locale store payload must be an object')
    }
    const envelope = parsed as Partial<LocaleEnvelope>
    if (envelope.scope !== 'profile' || typeof envelope.version !== 'number') {
      throw new Error('locale store payload has no profile/version')
    }
    const next = envelope.version === this.version
      ? readState(envelope.value)
      : this.migrate === undefined
        ? null
        : this.migrate(envelope.version, envelope.value)
    if (next === null) {
      throw new Error(
        `locale store version ${envelope.version} cannot migrate to ${this.version}`,
      )
    }
    const previous = this.current.locale
    this.current = cloneState(next)
    if (this.current.locale !== previous) {
      this.notify()
    }
  }

  static fromSerialized(options: LocaleStoreOptions, serialized: string): LocaleStore {
    const store = new LocaleStore(options)
    store.deserialize(serialized)
    return store
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.current.locale)
    }
  }
}
