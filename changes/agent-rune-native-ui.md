### Migrate

- `adjustSettingRow` now lives in `@jgengine/core/settings/settingAdjustment`; its arguments and result are unchanged. In-repo settings adopters use the new home.
- `createHudAwakeClock` and `sameWatched` now live in `@jgengine/core/hud/hudAwakeClock`, shared by the DOM and native HUD renderers.

### Added

- Direct native Rune elements for the engine JSX runtime, with one typed style set, live value slots, scrolling, modal input and settings controls. Set `uiRenderer: "rune"` and compose inside `RuneSurface` to bypass the CSS mirror.
- A headless native PNG renderer using the production builder, and native bounds/text for the game drive harness.

### Changed

- Deepward authors its whole HUD, menus, settings and credits through native Rune elements. Its stylesheet and CSS kit are removed. Other games keep the temporary mirror during migration.
