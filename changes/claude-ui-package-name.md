Replace `@jgengine/react` with `@jgengine/ui` in imports, dependencies and Tailwind `@source` paths, and `"react"` with `"ui"` in `jgengine.json`'s `engine` list.

Engine seam: packages/core/src/ai/AuthoredFlocks.draw.tsx, packages/core/src/anim/CharacterCrowd.draw.tsx, packages/core/src/anim/CorpseRagdolls.draw.tsx, packages/core/src/anim/tweenNumber.view.tsx, packages/core/src/anim/useEntityRenderCues.draw.ts, packages/core/src/anim/useModelAnimation.draw.ts, packages/core/src/audio/AudioComponents.draw.tsx, packages/core/src/camera/GameFirstPersonCamera.draw.tsx and 74 more

### Migrate

- Replace `@jgengine/react` with `@jgengine/ui` in imports, dependencies and Tailwind `@source` paths, and `"react"` with `"ui"` in `jgengine.json`'s `engine` list.

### Added

- `AccessibilityProvider` (`@jgengine/ui`): Apply accessibility preferences to a subtree: exposes `--jg-text-scale` for text to scale off, and sets `data-reduced-motion` / `data-high-contrast` / `data-colorblind` / `data-captions` for CSS to respond to. Also `AbilitySlotBindingOptions`, `AchievementGallery`, `AchievementGalleryProps`, `AchievementToast`, `AchievementToastProps`, `ActionBar`, `ActionBarChrome`, `ActionBarKeyResult` and 624 more.
- `EventfulEngineStore` (`@jgengine/ui/engineStore`): ⚠ undocumented Also `ReadableEngineStore`.
- `ENGINE_STYLESHEET` (`@jgengine/ui/engineStyles`): The engine stylesheet: every `jg-*` keyframe the shared blocks and registry components animate with, the `[data-jg-*]` interaction-state rules behind {@link HudButton} / {@link HudSurface}, the quiet hover/press/focus defaults for plain buttons inside the HUD root, and reduced-motion handling (`prefers-reduced-motion` or `[data-reduced-motion="true"]` zero `--jg-motion-scale`). Also `ensureEngineStyles`, `useEngineStyles`.
- `PerFrameRenderError` (`@jgengine/ui/hooks`): The error a component that re-renders every frame or tick from the store fails with in a dev build or test. Also `AbilitySlotBindingOptions`, `DomEventTarget`, `EventMeterView`, `GameClockControls`, `InventoryGridBinding`, `UseAxisChannelResult`, `WorldBrowserState`, `abilityKitNeedsHeartbeat` and 46 more.
- `GamePreviewComponent` (`@jgengine/ui/preview`): ⚠ undocumented Also `GamePreviewProps`, `GamePreviewStates`.
- `PREVIEW_FIXTURES` (`@jgengine/ui/previewFixtures`): Registry of deterministic, engine-level preview fixtures — the *real* exported `@jgengine/ui` components (`HudThemePreview`, `IconsPreview`, …) that render identically every time from static values, so they can be screenshotted as regression evidence without booting a game. Also `PreviewFixture`, `previewFixtureNames`, `resolvePreviewFixture`.
- `GameContextBridge` (`@jgengine/ui/provider`): Re-provide a captured {@link GameContext} across a nested UI reconciler boundary. Also `GameProvider`, `useGameContext`, `useOptionalGameContext`.
- `selectionEqual` (`@jgengine/ui/selectSnapshot`): Whether two selections show the same thing: the same value, or arrays and plain objects whose entries are the same all the way down (a record or class instance compares by identity). Also `HotSelectionPace`, `SelectCache`.
- `useKeyedStore` (`@jgengine/ui/store`): Subscribe a component to one owner's slot of a typed keyed-family store defined with `defineKeyedStore`. Also `useStore`.
- `MENU_THEME_STYLE` (`@jgengine/ui/testFixtures`): Menu theme tokens passed through the `style` prop with no cast.

### Changed

- The engine UI package is @jgengine/ui again; @jgengine/react is deprecated

### Removed

- `@jgengine/react` no longer exports `AbilitySlotBindingOptions`, `AccessibilityProvider`, `AchievementGallery`, `AchievementGalleryProps`, `AchievementToast`, `AchievementToastProps`, `ActionBar`, `ActionBarChrome` and 625 more.
- `@jgengine/react/engineStore` no longer exports `EventfulEngineStore`, `ReadableEngineStore`.
- `@jgengine/react/engineStyles` no longer exports `ENGINE_STYLESHEET`, `ensureEngineStyles`, `useEngineStyles`.
- `@jgengine/react/hooks` no longer exports `AbilitySlotBindingOptions`, `DomEventTarget`, `EventMeterView`, `GameClockControls`, `InventoryGridBinding`, `PerFrameRenderError`, `UseAxisChannelResult`, `WorldBrowserState` and 47 more.
- `@jgengine/react/preview` no longer exports `GamePreviewComponent`, `GamePreviewProps`, `GamePreviewStates`.
- `@jgengine/react/previewFixtures` no longer exports `PREVIEW_FIXTURES`, `PreviewFixture`, `previewFixtureNames`, `resolvePreviewFixture`.
- `@jgengine/react/provider` no longer exports `GameContextBridge`, `GameProvider`, `useGameContext`, `useOptionalGameContext`.
- `@jgengine/react/selectSnapshot` no longer exports `HotSelectionPace`, `SelectCache`, `selectionEqual`.
- `@jgengine/react/store` no longer exports `useKeyedStore`, `useStore`.
- `@jgengine/react/testFixtures` no longer exports `MENU_THEME_STYLE`.
