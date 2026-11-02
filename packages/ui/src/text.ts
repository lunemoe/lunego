import { createSignal } from 'solid-js'
import type { UiChild } from './ui-types.js'

export type MessageKey = string
export type MessageParams = Readonly<Record<string, string | number>>

/** A localizable reference; plain strings remain literal overrides. */
export interface MessageRef {
  readonly key: MessageKey
  readonly params?: MessageParams
}

export type TextValue = string | MessageRef
export type UiTextResolver = (key: MessageKey, params?: MessageParams) => string

/** Structural shape of `@lunego/i18n`'s `I18n`; no runtime dependency. */
export interface UiI18nSource {
  readonly t: UiTextResolver
  subscribe(listener: (locale: string) => void): () => void
}

interface ResolverSlot {
  readonly resolver: UiTextResolver
  readonly unsubscribe?: () => void
}

const [active, setActive] = createSignal<ResolverSlot | null>(null)
const [revision, setRevision] = createSignal(0)

export function message(key: MessageKey, params?: MessageParams): MessageRef {
  return params === undefined ? { key } : { key, params }
}

export function isMessageRef(value: unknown): value is MessageRef {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return (
    (prototype === Object.prototype || prototype === null) &&
    'key' in value &&
    typeof value.key === 'string'
  )
}

/**
 * Installs the active resolver and returns a restore function. Locale switches
 * bump an internal revision so rendered text re-resolves reactively.
 */
export function setUiTextResolver(source: UiTextResolver | UiI18nSource | null): () => void {
  const previous = active()
  previous?.unsubscribe?.()
  if (source === null) {
    setActive(null)
  } else if (typeof source === 'function') {
    setActive({ resolver: source })
  } else {
    setActive({
      resolver: source.t,
      unsubscribe: source.subscribe(() => setRevision((value) => value + 1)),
    })
  }
  setRevision((value) => value + 1)
  return () => {
    active()?.unsubscribe?.()
    setActive(previous)
    setRevision((value) => value + 1)
  }
}

export const installUiI18n = setUiTextResolver

/** Resolve a key reference; strings are literal overrides. */
export function resolveText(value: TextValue | null | undefined, fallback = ''): string {
  revision()
  if (value === null || value === undefined) {
    return fallback
  }
  if (typeof value === 'string') {
    return value
  }
  const slot = active()
  if (slot === null) {
    return value.key
  }
  return slot.resolver(value.key, value.params)
}

/** Best-effort text extraction for aria attributes. */
export function textOf(value: UiChild | TextValue | null | undefined, fallback = ''): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }
  if (isMessageRef(value)) {
    return resolveText(value)
  }
  return fallback
}

/** Render a text reference while preserving arbitrary UI children. */
export function resolveChild(
  value: UiChild | TextValue | null | undefined,
  fallback: UiChild = '',
): UiChild {
  if (isMessageRef(value)) {
    return resolveText(value)
  }
  return value ?? fallback
}
