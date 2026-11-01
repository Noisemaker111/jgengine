i18n plurals, locale formatting and right-to-left layout with the platform's Intl APIs; the player's locale is a shell setting

### Added

- i18n plurals, locale formatting and right-to-left layout with the platform's Intl APIs; the player's locale is a shell setting
- `selectPlural` (`@jgengine/core/i18n/i18n`): The template of `message` for `count`: the exact `zero`, else the locale's category, else `other`. Also `Message`, `PluralCategory`, `PluralMessage`.
- `LocaleRoot` (`@jgengine/core/i18n/i18n.view`): The shell's locale root: keeps `i18n` on the player's locale setting (browser default, base-locale fallback), provides it to the tree, and sets `lang` and `dir` on the document and a wrapper so right-to-left locales flip the HUD. Also `LocaleScope`.
- `formatCompact` (`@jgengine/core/i18n/localeFormat`): A short large number: `12500` is `12.5K` in English, `1.25万` in Japanese. Also `DurationFormatOptions`, `formatDate`, `formatLocaleCurrency`, `formatLocaleDuration`, `formatLocaleNumber`, `formatPercent`, `formatRelative`, `formatRelativeTo` and 1 more.
- `LOCALE_SETTING_ID` (`@jgengine/core/i18n/localeSetting`): The persisted settings id of the player's locale. Also `localeSettingDef`, `matchLocale`, `readLocale`, `withLocaleSetting`.
- `localeDirection` (`@jgengine/core/i18n/textDirection`): Reading direction of a locale tag (`"ar"`, `"he-IL"`, `"ur-PK"` are `rtl`). Also `TextDirection`.
- `TextDirectionProvider` (`@jgengine/core/i18n/textDirection.view`): Sets the reading direction `useTextDirection` answers below it. Also `useTextDirection`.
- `LOCALE_SETTING_ID` (`@jgengine/core/ui`): The persisted settings id of the player's locale. Also `Message`, `PluralCategory`, `PluralMessage`, `TextDirection`, `localeDirection`, `localeSettingDef`, `matchLocale`, `readLocale` and 2 more.
- `LocaleRoot` (`@jgengine/react`): The shell's locale root: keeps `i18n` on the player's locale setting (browser default, base-locale fallback), provides it to the tree, and sets `lang` and `dir` on the document and a wrapper so right-to-left locales flip the HUD. Also `LocaleScope`, `TextDirectionProvider`, `useTextDirection`.

### Changed

- Part of #2837
