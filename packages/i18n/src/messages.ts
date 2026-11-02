export type MessageKey = string

export type MessageParams = Readonly<Record<string, string | number>>

/** A template with one entry per plural form (`one`, `other`, ...). */
export type PluralForms = Readonly<Record<string, string>>

export type MessageTemplate = string | PluralForms

/** locale -> message key -> template. */
export type StringTable = Readonly<Record<string, Readonly<Record<string, MessageTemplate>>>>

/** Returns the plural form name for a count; supplied by the game/locale policy. */
export type PluralRule = (count: number, locale: string) => string

export type MissingMode = 'error' | 'key'

export interface I18nOptions {
  readonly messages: StringTable
  readonly locale: string
  readonly fallbackLocale?: string
  readonly dev?: boolean
  readonly missing?: MissingMode
  readonly pluralRule?: PluralRule
  readonly onMissing?: (key: string, locale: string) => void
}

export interface I18n {
  readonly locale: string
  readonly t: (key: MessageKey, params?: MessageParams) => string
  readonly translate: (key: MessageKey, params?: MessageParams) => string
  setLocale(locale: string): void
  setMessages(messages: StringTable): void
  subscribe(listener: (locale: string) => void): () => void
}

export function defineMessages<T extends StringTable>(table: T): T {
  return table
}

interface Lookup {
  readonly template: MessageTemplate
  readonly locale: string
}

function interpolate(template: string, params: MessageParams | undefined): string {
  if (params === undefined) {
    return template
  }
  return template.replace(/\{(\w+)\}/g, (match: string, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}

function pluralForm(template: PluralForms, form: string): string | undefined {
  return template[form] ?? template['other'] ?? Object.values(template)[0]
}

/**
 * Creates a resolver with locale fallback, `{name}` interpolation, injected
 * plural selection and explicit missing-key policy. No DOM/localStorage access.
 */
export function createI18n(options: I18nOptions): I18n {
  let messages = options.messages
  let current = options.locale
  const listeners = new Set<(locale: string) => void>()
  const pluralRule = options.pluralRule ?? ((count: number) => (count === 1 ? 'one' : 'other'))
  const missingMode: MissingMode = options.missing ?? (options.dev === true ? 'error' : 'key')

  const chain = (locale: string): readonly string[] => {
    const values: string[] = []
    const add = (value: string | undefined): void => {
      if (value !== undefined && value.length > 0 && !values.includes(value)) {
        values.push(value)
      }
    }
    add(locale)
    add(locale.split('-')[0])
    add(options.fallbackLocale)
    if (options.fallbackLocale !== undefined) {
      add(options.fallbackLocale.split('-')[0])
    }
    return values
  }

  const lookup = (key: MessageKey, locale: string): Lookup | null => {
    for (const candidate of chain(locale)) {
      const table = messages[candidate]
      const template = table?.[key]
      if (template !== undefined) {
        return { template, locale: candidate }
      }
    }
    return null
  }

  const miss = (key: MessageKey, locale: string): string => {
    options.onMissing?.(key, locale)
    if (missingMode === 'error') {
      throw new Error(`missing i18n message "${key}" for locale "${locale}"`)
    }
    return key
  }

  const translate = (key: MessageKey, params?: MessageParams): string => {
    const found = lookup(key, current)
    if (found === null) {
      return miss(key, current)
    }
    const count = params?.['count']
    if (typeof found.template === 'string') {
      return interpolate(found.template, params)
    }
    const form = typeof count === 'number' ? pluralRule(count, found.locale) : 'other'
    const template = pluralForm(found.template, form)
    return template === undefined ? miss(key, found.locale) : interpolate(template, params)
  }

  return {
    get locale() {
      return current
    },
    t: translate,
    translate,
    setLocale(locale: string): void {
      if (locale.length === 0) {
        throw new Error('locale must not be empty')
      }
      if (locale === current) {
        return
      }
      current = locale
      for (const listener of listeners) {
        listener(current)
      }
    },
    setMessages(next: StringTable): void {
      messages = next
    },
    subscribe(listener: (locale: string) => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
