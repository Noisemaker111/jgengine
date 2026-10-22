### Added

- `@jgengine/core/settings/accessibilitySettings`: the persisted accessibility ids (`accessibility.textScale`, `accessibility.colorblind`, `accessibility.reducedMotion`, `accessibility.highContrast`, `accessibility.captions`, `controls.holdVsToggle`), `accessibilitySettingRows(store)` for a settings surface, `readAccessibilitySettings(store)`, and `holdToggleActive(previous, { pressed, held }, mode)` for hold-or-toggle actions.
- The shell's settings menu has an `accessibility` category (text size, colourblind palette, reduce motion, high contrast, captions, hold-or-toggle) unless a game hides it. Text size scales every `--jg-type-*` token through `--jg-text-scale`; reduce motion zeroes the engine's motion scale; high contrast, colourblind and captions are exposed as `data-*` hooks on the HUD root.
- `SettingsSection`, `SettingsRowControl`, `SettingsSlider`, `SettingsToggle`, `SettingsSelect`, `SettingsKeybindControl` and `SettingsTabs` (`@jgengine/react/settingsBlocks`): the settings rows and click-to-capture controls as composable, HudTheme-tokenized blocks, so a game lays out its own settings screen instead of taking the stock dialog. Rebinding writes into the game's existing rebind/holdings store.
- `useAccessibilitySettings`, `useHoldVsToggle` and `useAccessibilityRows` (`@jgengine/react/accessibilitySettings`) read the live preferences for any custom layout.
- `HudThemeRoot` takes `accessibility` and applies text scale and the preference data attributes at the HUD root; the shell passes the player's stored preferences there for both the 3D and HUD-only presentation paths.

### Fixed

- A type token now honors the player's text scale: `--jg-type-*` are `calc(max(floor, size) * var(--jg-text-scale, 1))`, so raising text size resizes every engine block rather than only a menu's own labels.
