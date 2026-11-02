import { describe, expect, it, vi } from 'vitest'
import {
  LOCALE_STORE_VERSION,
  LocaleStore,
  createI18n,
  defineMessages,
  type StringTable,
} from '../index.js'

const messages: StringTable = defineMessages({
  en: {
    'greet': 'Hello {name}',
    'items.one': '{count} item',
    'items.other': '{count} items',
    'fallback.only': 'English only',
    'plural.table': { one: '{count} apple', other: '{count} apples' },
  },
  'fr-CA': {
    'greet': 'Bonjour {name}',
    'items.one': '{count} article',
    'items.other': '{count} articles',
  },
  fr: {
    'greet': 'Salut {name}',
  },
})

describe('createI18n', () => {
  it('interpolates parameters and keeps unknown placeholders', () => {
    const i18n = createI18n({ messages, locale: 'en' })
    expect(i18n.t('greet', { name: 'Ada' })).toBe('Hello Ada')
    expect(i18n.t('greet')).toBe('Hello {name}')
  })

  it('selects plural forms with an injected rule', () => {
    const rule = vi.fn((count: number) => (count === 1 ? 'one' : 'other'))
    const i18n = createI18n({ messages, locale: 'en', pluralRule: rule })
    expect(i18n.t('plural.table', { count: 1 })).toBe('1 apple')
    expect(i18n.t('plural.table', { count: 3 })).toBe('3 apples')
    expect(rule).toHaveBeenCalledWith(1, 'en')
  })

  it('falls back from region to language to fallback locale', () => {
    const i18n = createI18n({ messages, locale: 'fr-CA', fallbackLocale: 'en' })
    expect(i18n.t('greet', { name: 'Ada' })).toBe('Bonjour Ada')
    expect(i18n.t('fallback.only')).toBe('English only')
  })

  it('reports missing keys in dev and falls back to the key in production', () => {
    const onMissing = vi.fn()
    const dev = createI18n({ messages, locale: 'en', dev: true, onMissing })
    expect(() => dev.t('missing.key')).toThrow(/missing i18n message/)
    expect(onMissing).toHaveBeenCalledWith('missing.key', 'en')

    const prod = createI18n({ messages, locale: 'en', onMissing })
    expect(prod.t('missing.key')).toBe('missing.key')
  })

  it('switches locale and notifies subscribers', () => {
    const i18n = createI18n({ messages, locale: 'en' })
    const listener = vi.fn()
    const dispose = i18n.subscribe(listener)
    i18n.setLocale('fr')
    expect(i18n.locale).toBe('fr')
    expect(i18n.t('greet', { name: 'Ada' })).toBe('Salut Ada')
    expect(listener).toHaveBeenCalledWith('fr')
    i18n.setLocale('fr')
    expect(listener).toHaveBeenCalledTimes(1)
    dispose()
  })
})

describe('LocaleStore', () => {
  it('emits locale changes, serializes as profile scope and resets', () => {
    const store = new LocaleStore({ defaultLocale: 'en', fallbackLocale: 'en' })
    const listener = vi.fn()
    store.subscribe(listener)
    store.setLocale('fr-CA')
    expect(store.locale).toBe('fr-CA')
    expect(listener).toHaveBeenCalledWith('fr-CA')

    const parsed = JSON.parse(store.serialize()) as Record<string, unknown>
    expect(parsed['version']).toBe(LOCALE_STORE_VERSION)
    expect(parsed['scope']).toBe('profile')

    store.reset()
    expect(store.locale).toBe('en')
    expect(listener).toHaveBeenLastCalledWith('en')
  })

  it('restores and migrates serialized locale state', () => {
    const store = new LocaleStore({ defaultLocale: 'en', fallbackLocale: 'en' })
    store.setLocale('fr')
    const restored = LocaleStore.fromSerialized(
      { defaultLocale: 'en', fallbackLocale: 'en' },
      store.serialize(),
    )
    expect(restored.locale).toBe('fr')

    const migrated = LocaleStore.fromSerialized(
      {
        defaultLocale: 'en',
        version: 2,
        migrate: (fromVersion, value) => {
          expect(fromVersion).toBe(1)
          expect(value).toEqual({ locale: 'de' })
          return { locale: 'de', fallbackLocale: 'en' }
        },
      },
      JSON.stringify({ version: 1, scope: 'profile', value: { locale: 'de' } }),
    )
    expect(migrated.locale).toBe('de')
    expect(migrated.fallbackLocale).toBe('en')
  })

  it('rejects malformed or unmigratable payloads', () => {
    const store = new LocaleStore({ defaultLocale: 'en' })
    expect(() => store.deserialize('not json')).toThrow(/JSON/)
    expect(() => store.deserialize(JSON.stringify({ scope: 'world', version: 1 }))).toThrow(
      /profile\/version/,
    )
    expect(() =>
      store.deserialize(JSON.stringify({ scope: 'profile', version: 99, value: { locale: 'en' } })),
    ).toThrow(/cannot migrate/)
  })
})
