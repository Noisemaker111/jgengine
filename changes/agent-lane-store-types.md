### Fixed

- `createSettingsStore().get` returns a stored setting of another type instead of quietly returning the fallback, so a numeric setting read with a string fallback applies instead of vanishing (#2189). Root cause: `coerce` treated the fallback's type as the stored type and replaced every other type with the fallback. A stored value that cannot be read as the asked-for type now throws `SettingsTypeError` naming the key, the stored type and the fallback type.

### Added

- `SettingsTypeError` and `asSettingType` (`@jgengine/core/settings/settingsModel`) report and resolve a stored setting read as another type.

### Migrate

- A read of a mismatched stored value now converts losslessly where it can (a number as its digits, a boolean as `"true"`/`"false"`, those strings back) and throws where it cannot. No in-repo caller relied on the old fallback; `useSetting` (`@jgengine/react/settings`) is the generic path that could, so a game that stored a number under a key it reads with a string fallback now gets the digits.
