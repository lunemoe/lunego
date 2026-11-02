# @lunego/i18n

游戏无关的本地化运行时：消息表、插值、注入式复数规则、locale fallback，以及 profile scope 的 `LocaleStore`。不读 DOM/localStorage，也不内置任何语言、翻译或游戏文案。

## 契约

- `defineMessages({ 'en': { key: '...' }, ... })`：locale -> key -> template，原样返回并保留字面量类型。
- `createI18n({ messages, locale, fallbackLocale, dev, missing, pluralRule, onMissing })`：返回 `t(key, params?)`、`setLocale`、`setMessages`、`subscribe`。`t` 可直接作为 `@lunego/ui` 的 resolver（签名 `(key, params?) => string`）。
- 插值：`{name}`；未提供的参数保持原占位符。
- 复数：template 可以是 `{ one, other, ... }`；表单名由注入的 `pluralRule(count, locale)` 决定，未提供时使用 `count === 1 ? 'one' : 'other'`。不使用 `Intl` 做逻辑。
- fallback：按 `locale` → 主语言（`fr-CA` → `fr`）→ `fallbackLocale` → fallback 主语言查找 key。
- 缺失 key：`missing: 'error'` 抛错，`'key'` 返回 key 本身；`dev: true` 默认抛错。`onMissing` 总会先被通知。
- 翻译内容、复数规则和缺失策略由游戏提供；框架不写入具体译文。

## LocaleStore

`new LocaleStore({ defaultLocale, fallbackLocale, initial, version, migrate })`：

- `locale`/`fallbackLocale`/`value`、`setLocale`、`setFallbackLocale`、`reset`。
- `subscribe(locale => ...)` 在语言真正变化时触发。
- `serialize()` 输出 `{ version, scope: 'profile', value: { locale, fallbackLocale? } }`；`deserialize()` 校验 scope/version，并按 `migrate(fromVersion, value)` 迁移；`LocaleStore.fromSerialized(options, json)`。
- 持久化由 host 负责（例如 profile settings store），本包不直接访问存储。

## 与 UI 的边界

- `@lunego/ui` 只依赖结构性的 resolver（`(key, params?) => string`）和 `subscribe`，不需要运行时依赖本包；把 `createI18n(...)` 返回的 `t` 或 `I18n` 传给 `UiRoot({ i18n })` 即可。
- 显式字符串仍是字面量覆盖；只有 `{ key, params? }` 引用走 resolver。缺失 key 在 UI 中默认显示 key 本身，便于发现漏配。
