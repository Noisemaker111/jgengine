tarball install tests, browser fixtures, simulate and the skill api/capability generators turn a package folder into its npm name through scripts/packageNames.ts. They used the folder name, so the tarball test installed packages/ui as @jgengine/ui (CI failed on 0.56.1's commit) and the generated skill docs told users to import @jgengine/ui.

### Added

- `AccessibilityProvider` (`@jgengine/react`): Apply accessibility preferences to a subtree: exposes `--jg-text-scale` for text to scale off, and sets `data-reduced-motion` / `data-high-contrast` / `data-colorblind` / `data-captions` for CSS to respond to. Also `AbilitySlotBindingOptions`, `AchievementGallery`, `AchievementGalleryProps`, `AchievementToast`, `AchievementToastProps`, `ActionBar`, `ActionBarChrome`, `ActionBarKeyResult` and 624 more.
- `EventfulEngineStore` (`@jgengine/react/engineStore`): ⚠ undocumented Also `ReadableEngineStore`.
- `ENGINE_STYLESHEET` (`@jgengine/react/engineStyles`): The engine stylesheet: every `jg-*` keyframe the shared blocks and registry components animate with, the `[data-jg-*]` interaction-state rules behind {@link HudButton} / {@link HudSurface}, the quiet hover/press/focus defaults for plain buttons inside the HUD root, and reduced-motion handling (`prefers-reduced-motion` or `[data-reduced-motion="true"]` zero `--jg-motion-scale`). Also `ensureEngineStyles`, `useEngineStyles`.
- `PerFrameRenderError` (`@jgengine/react/hooks`): The error a component that re-renders every frame or tick from the store fails with in a dev build or test. Also `AbilitySlotBindingOptions`, `DomEventTarget`, `EventMeterView`, `GameClockControls`, `InventoryGridBinding`, `UseAxisChannelResult`, `WorldBrowserState`, `abilityKitNeedsHeartbeat` and 46 more.
- `GamePreviewComponent` (`@jgengine/react/preview`): ⚠ undocumented Also `GamePreviewProps`, `GamePreviewStates`.
- `PREVIEW_FIXTURES` (`@jgengine/react/previewFixtures`): Registry of deterministic, engine-level preview fixtures — the *real* exported `@jgengine/react` components (`HudThemePreview`, `IconsPreview`, …) that render identically every time from static values, so they can be screenshotted as regression evidence without booting a game. Also `PreviewFixture`, `previewFixtureNames`, `resolvePreviewFixture`.
- `GameContextBridge` (`@jgengine/react/provider`): Re-provide a captured {@link GameContext} across a nested React reconciler boundary. Also `GameProvider`, `useGameContext`, `useOptionalGameContext`.
- `selectionEqual` (`@jgengine/react/selectSnapshot`): Whether two selections show the same thing: the same value, or arrays and plain objects whose entries are the same all the way down (a record or class instance compares by identity). Also `HotSelectionPace`, `SelectCache`.
- `useKeyedStore` (`@jgengine/react/store`): Subscribe a component to one owner's slot of a typed keyed-family store defined with `defineKeyedStore`. Also `useStore`.
- `MENU_THEME_STYLE` (`@jgengine/react/testFixtures`): Menu theme tokens passed through the `style` prop with no cast.

### Fixed

- tarball install tests, browser fixtures, simulate and the skill api/capability generators turn a package folder into its npm name through scripts/packageNames.ts. They used the folder name, so the tarball test installed packages/ui as @jgengine/ui (CI failed on 0.56.1's commit) and the generated skill docs told users to import @jgengine/ui.

### Removed

- `@jgengine/ui` no longer exports `AbilitySlotBindingOptions`, `AccessibilityProvider`, `AchievementGallery`, `AchievementGalleryProps`, `AchievementToast`, `AchievementToastProps`, `ActionBar`, `ActionBarChrome` and 625 more.
- `@jgengine/ui/engineStore` no longer exports `EventfulEngineStore`, `ReadableEngineStore`.
- `@jgengine/ui/engineStyles` no longer exports `ENGINE_STYLESHEET`, `ensureEngineStyles`, `useEngineStyles`.
- `@jgengine/ui/hooks` no longer exports `AbilitySlotBindingOptions`, `DomEventTarget`, `EventMeterView`, `GameClockControls`, `InventoryGridBinding`, `PerFrameRenderError`, `UseAxisChannelResult`, `WorldBrowserState` and 47 more.
- `@jgengine/ui/preview` no longer exports `GamePreviewComponent`, `GamePreviewProps`, `GamePreviewStates`.
- `@jgengine/ui/previewFixtures` no longer exports `PREVIEW_FIXTURES`, `PreviewFixture`, `previewFixtureNames`, `resolvePreviewFixture`.
- `@jgengine/ui/provider` no longer exports `GameContextBridge`, `GameProvider`, `useGameContext`, `useOptionalGameContext`.
- `@jgengine/ui/selectSnapshot` no longer exports `HotSelectionPace`, `SelectCache`, `selectionEqual`.
- `@jgengine/ui/store` no longer exports `useKeyedStore`, `useStore`.
- `@jgengine/ui/testFixtures` no longer exports `MENU_THEME_STYLE`.
