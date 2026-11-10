### Migrate

- Native games compose `RuneRoot`, `RuneView`, `RuneLabel`, `RuneAction`, `RuneFor`, `RuneLayers`, `RuneTransient` and `RuneWorldAnchor` from `@jgengine/core/ui/rune/primitives.view`. Theme tokens and native style props replace game CSS; the new API supplies no finished widgets or screens. See the page-sized example in the jgengine-ui skill.
- `ActionBindingsProvider` and `useActionBindings` move from `ui/kit/uiKitRoot.view` to `input/actionBindings.view`, so native UI reads rebinds without importing a CSS kit. All in-repo imports move with them.
- `adjustSettingRow` now lives in `@jgengine/core/settings/settingAdjustment`; its arguments and result are unchanged. In-repo settings adopters use the new home.
- `createHudAwakeClock` and `sameWatched` now live in `@jgengine/core/hud/hudAwakeClock`, shared by the DOM and native HUD renderers.

### Added

- Direct native Rune primitives for the engine JSX runtime, with one typed style set, bound slots/property patches, responsive/safe/world anchoring, keyed collections, native interaction and flow ownership. Set `uiRenderer: "rune"` and compose inside `RuneRoot` to bypass the CSS mirror.
- A headless native PNG renderer using the production builder, and native bounds/text for the game drive harness.

### Changed

- Deepward composes its whole HUD, menus, settings, credits and game-specific panels from native Rune primitives. Its stylesheet, CSS kit and old visor composition are removed. Other games keep the temporary mirror during migration.
