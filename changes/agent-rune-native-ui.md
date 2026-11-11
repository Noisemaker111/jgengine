Native games compose `RuneRoot`, `RuneView`, `RuneLabel`, `RuneAction`, `RuneFor`, `RuneLayers`, `RuneTransient` and `RuneWorldAnchor` from `@jgengine/core/ui/rune/primitives.view`. Theme tokens and native style props replace game CSS; the new API supplies no finished widgets or screens. See the page-sized example in the jgengine-ui skill.

Engine seam: packages/core/src/dialog/modalStack.ts, packages/core/src/hud/hudAwakeClock.ts, packages/core/src/hud/hudLayout.view.tsx, packages/core/src/input/actionBindings.view.tsx, packages/core/src/settings/settingAdjustment.ts, packages/core/src/settings/settingsBlocks.view.tsx, packages/core/src/ui/jsx/client.view.ts, packages/core/src/ui/jsx/pageHost.view.ts and 17 more

### Migrate

- Native games compose `RuneRoot`, `RuneView`, `RuneLabel`, `RuneAction`, `RuneFor`, `RuneLayers`, `RuneTransient` and `RuneWorldAnchor` from `@jgengine/core/ui/rune/primitives.view`. Theme tokens and native style props replace game CSS; the new API supplies no finished widgets or screens. See the page-sized example in the jgengine-ui skill.
- `ActionBindingsProvider` and `useActionBindings` move from `ui/kit/uiKitRoot.view` to `input/actionBindings.view`, so native UI reads rebinds without importing a CSS kit. All in-repo imports move with them.
- `adjustSettingRow` now lives in `@jgengine/core/settings/settingAdjustment`; its arguments and result are unchanged. In-repo settings adopters use the new home.
- `createHudAwakeClock` and `sameWatched` now live in `@jgengine/core/hud/hudAwakeClock`, shared by the DOM and native HUD renderers.

### Added

- Direct native Rune primitives for the engine JSX runtime, with one typed style set, bound slots/property patches, responsive/safe/world anchoring, keyed collections, native interaction and flow ownership. Set `uiRenderer: "rune"` and compose inside `RuneRoot` to bypass the CSS mirror.
- A headless native PNG renderer using the production builder, and native bounds/text for the game drive harness.
- Rune-native UI primitives (RuneRoot, RuneView, RuneLabel, RuneAction, RuneFor, RuneLayers, RuneTransient, RuneWorldAnchor, RuneGlyph) and Deepward rebuilt on them with no CSS or DOM host
- `ActionBindingsProvider` (`@jgengine/core/input/actionBindings.view`): Provide the game's live bindings, including player rebinds, without a presentation kit. Also `useActionBindings`.
- `adjustSettingRow` (`@jgengine/core/settings/settingAdjustment`): Step a slider within its bounds, flip a toggle or cycle a selection.
- `pageHost` (`@jgengine/core/ui/jsx/pageHost.view`): One JSX tree can contain native surfaces and ordinary page tooling, sharing all providers.
- `RuneActivation` (`@jgengine/core/ui/rune/activation`): Hold activation shared by pointer, touch, keyboard and pad, using an injected clock. Also `runeNextFocus`.
- `RuneBoundFont` (`@jgengine/core/ui/rune/element`): ⚠ undocumented Also `RuneBoundStyle`, `RuneColor`, `RuneElement`, `RuneElementProps`, `RuneFont`, `RuneGesture`, `RuneSize`, `RuneSpan` and 1 more.
- `RuneBox` (`@jgengine/core/ui/rune/elements.view`): Native Rune column. Also `RuneButton`, `RuneIcon`, `RuneRow`, `RuneScroll`, `RuneSurface`, `RuneText`, `RuneViewport`, `useRuneViewport`.
- `registerNativeRuneFont` (`@jgengine/core/ui/rune/nativeSurface.view`): Register native font bytes before the first surface mounts.
- `RuneNode` (`@jgengine/core/ui/rune/nativeTree`): A native host node; it has no browser element or computed style. Also `NativeWireNode`, `RuneTreeSink`, `nativeEnabled`, `nativeLabel`, `nativeSpec`, `nativeTreeHost`.
- `bind` (`@jgengine/core/ui/rune/primitives`): Bind any native visual property without scheduling a component render. Also `RuneFlow`, `RuneRoute`, `RuneSource`, `RuneTheme`, `RuneViewportClass`, `createRuneFlow`, `ownRuneFlow`, `runeFormat` and 3 more.
- `RuneAction` (`@jgengine/core/ui/rune/primitives.view`): Command interaction with native focus, pointer/touch, keyboard, pad, hold and drag/drop. Also `RuneActionProps`, `RuneAnchor`, `RuneFor`, `RuneGlyph`, `RuneLabel`, `RuneLabelProps`, `RuneLayers`, `RuneProjection` and 6 more.

### Changed

- Deepward composes its whole HUD, menus, settings, credits and game-specific panels from native Rune primitives. Its stylesheet, CSS kit and old visor composition are removed. Other games keep the temporary mirror during migration.

### Fixed

- gamepad taps, held input and landing lock checks no longer race host scheduling

### Removed

- `@jgengine/core/settings/settingsBlocks.view` no longer exports `adjustSettingRow`.
- `@jgengine/core/ui/kit/uiKitRoot.view` no longer exports `ActionBindingsProvider`, `useActionBindings`.
- `@jgengine/ui` no longer exports `ActionBindingsProvider`, `useActionBindings`.
