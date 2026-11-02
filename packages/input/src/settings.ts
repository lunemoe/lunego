import type { InputMap } from './actions.js'
import type { KeyEventLike, KeyboardTarget } from './input.js'
import type { GamepadBindings } from './gamepad.js'

export type SettingsScope = 'profile'

export interface SettingsSchema<T> {
  readonly version: number
  readonly scope: SettingsScope
  readonly defaults: T
  /** Optional migration for older serialized versions. */
  readonly migrate?: (fromVersion: number, value: unknown) => T
}

export interface SettingsEnvelope<T> {
  readonly version: number
  readonly scope: SettingsScope
  readonly value: T
}

export function defineSettingsSchema<T>(options: SettingsSchema<T>): SettingsSchema<T> {
  if (!Number.isInteger(options.version) || options.version < 1) {
    throw new Error('settings version must be a positive integer')
  }
  if (options.scope !== 'profile') {
    throw new Error('settings scope must be profile')
  }
  return options
}

/** Versioned, profile-scoped settings with JSON serialization and reset. */
export class SettingsProfile<T> {
  readonly schema: SettingsSchema<T>
  private current: T

  constructor(schema: SettingsSchema<T>, initial?: T) {
    this.schema = schema
    this.current = initial === undefined ? clone(schema.defaults) : clone(initial)
  }

  get value(): Readonly<T> {
    return this.current
  }

  get version(): number {
    return this.schema.version
  }

  set(value: T): void {
    this.current = clone(value)
  }

  reset(): void {
    this.current = clone(this.schema.defaults)
  }

  serialize(): string {
    const envelope: SettingsEnvelope<T> = {
      version: this.schema.version,
      scope: this.schema.scope,
      value: this.current,
    }
    return JSON.stringify(envelope)
  }

  deserialize(serialized: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(serialized)
    } catch (error) {
      throw new Error('settings JSON is invalid', { cause: error })
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('settings payload must be an object')
    }
    const envelope = parsed as Partial<SettingsEnvelope<unknown>>
    if (envelope.scope !== 'profile' || typeof envelope.version !== 'number') {
      throw new Error('settings payload has no profile/version')
    }
    if (envelope.version === this.schema.version) {
      this.current = clone(envelope.value as T)
      return
    }
    if (this.schema.migrate === undefined) {
      throw new Error(
        `settings version ${envelope.version} cannot migrate to ${this.schema.version}`,
      )
    }
    this.current = this.schema.migrate(envelope.version, envelope.value)
  }

  static fromSerialized<T>(schema: SettingsSchema<T>, serialized: string): SettingsProfile<T> {
    const profile = new SettingsProfile(schema)
    profile.deserialize(serialized)
    return profile
  }
}

export interface KeybindSettingsData {
  readonly bindings: InputMap
  readonly uiScale: number
  readonly reducedMotion: boolean
  readonly gamepad?: GamepadBindings
}

export const KEYBIND_SETTINGS_VERSION = 2

const EMPTY_GAMEPAD: GamepadBindings = { buttons: [], axes: [] }

export function keybindSettingsSchema(
  defaults: InputMap,
): SettingsSchema<KeybindSettingsData> {
  return defineSettingsSchema({
    version: KEYBIND_SETTINGS_VERSION,
    scope: 'profile',
    defaults: {
      bindings: cloneMap(defaults),
      uiScale: 1,
      reducedMotion: false,
      gamepad: EMPTY_GAMEPAD,
    },
    migrate: (_from, old) => {
      const value = old as Partial<KeybindSettingsData>
      return {
        bindings: value.bindings ?? cloneMap(defaults),
        uiScale: value.uiScale ?? 1,
        reducedMotion: value.reducedMotion ?? false,
        gamepad: value.gamepad ?? EMPTY_GAMEPAD,
      }
    },
  })
}

export function createKeybindSettings(
  defaults: InputMap,
  initial?: KeybindSettingsData,
): SettingsProfile<KeybindSettingsData> {
  return new SettingsProfile(keybindSettingsSchema(defaults), initial)
}

export interface KeybindConflict {
  readonly code: string
  readonly actions: readonly string[]
}

/** Finds a physical key bound to more than one action. */
export function keybindConflicts(map: InputMap): readonly KeybindConflict[] {
  const byCode = new Map<string, string[]>()
  for (const action of Object.keys(map).sort()) {
    for (const code of map[action] ?? []) {
      const actions = byCode.get(code) ?? []
      if (!actions.includes(action)) {
        actions.push(action)
      }
      byCode.set(code, actions)
    }
  }
  return [...byCode.entries()]
    .filter(([, actions]) => actions.length > 1)
    .map(([code, actions]) => ({ code, actions }))
}

/** Rejects a binding that steals an existing key from another action. */
export function bindingConflict(
  map: InputMap,
  action: string,
  codes: readonly string[],
): KeybindConflict | null {
  const conflicts = new Set(codes)
  for (const [name, bound] of Object.entries(map)) {
    if (name === action) {
      continue
    }
    const found = bound.find((code) => conflicts.has(code))
    if (found !== undefined) {
      return { code: found, actions: [name, action] }
    }
  }
  return null
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function cloneMap(map: InputMap): InputMap {
  const result: Record<string, readonly string[]> = {}
  for (const action of Object.keys(map)) {
    result[action] = [...map[action]]
  }
  return result
}

export interface KeybindCaptureOptions {
  readonly target: KeyboardTarget
  readonly onCapture: (code: string) => void
  readonly onCancel?: () => void
  readonly ignoredCodes?: readonly string[]
}

/** Captures one physical key; the caller owns the browser keyboard target. */
export class KeybindCapture {
  private readonly target: KeyboardTarget
  private readonly onCapture: (code: string) => void
  private readonly onCancel: (() => void) | undefined
  private readonly ignored: ReadonlySet<string>
  private active = false

  constructor(options: KeybindCaptureOptions) {
    this.target = options.target
    this.onCapture = options.onCapture
    this.onCancel = options.onCancel
    this.ignored = new Set(options.ignoredCodes ?? ['Escape', 'Tab'])
  }

  get isActive(): boolean {
    return this.active
  }

  start(): void {
    if (this.active) {
      return
    }
    this.active = true
    this.target.addEventListener('keydown', this.handleKeyDown as (event: KeyEventLike) => void)
  }

  stop(): void {
    if (!this.active) {
      return
    }
    this.active = false
    this.target.removeEventListener('keydown', this.handleKeyDown as (event: KeyEventLike) => void)
  }

  private readonly handleKeyDown = (event: KeyEventLike): void => {
    if (!this.active || event.repeat === true) {
      return
    }
    event.preventDefault?.()
    if (event.code === 'Escape') {
      this.stop()
      this.onCancel?.()
      return
    }
    if (this.ignored.has(event.code)) {
      return
    }
    this.stop()
    this.onCapture(event.code)
  }
}
