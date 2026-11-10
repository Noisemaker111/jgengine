engine and game UI uses @jgengine/core/ui/jsx and @jgengine/ui; the website and two framework examples retain their own React host and embed games with mountGamePlayer

Closes #3019

Engine seam: packages/convex/src/convexChatTransport.ts, packages/convex/src/convexPresenceTransport.ts, packages/core/src/achievements/achievements.view.tsx, packages/core/src/ai/AuthoredFlocks.draw.tsx, packages/core/src/ambientFauna/AmbientFauna.draw.tsx, packages/core/src/anim/CharacterCrowd.draw.tsx, packages/core/src/anim/CorpseRagdolls.draw.tsx, packages/core/src/anim/SkinnedInstances.draw.tsx and 449 more

### Migrate

- engine and game UI uses @jgengine/core/ui/jsx and @jgengine/ui; the website and two framework examples retain their own React host and embed games with mountGamePlayer

### Added

- Rune rendering stays opt-in through ?ui=rune; DOM remains the default. The CSS styling path and CSS-to-Rune mirror are temporary while typed Rune-native props replace CSS
- `uiTour` (`@jgengine/core/play/uiTour`): ⚠ undocumented Also `TourStep`.
- `Children` (`@jgengine/core/ui/jsx`): ⚠ undocumented Also `ActionDispatch`, `AnyActionArg`, `CSSProperties`, `Component`, `ComponentClass`, `ComponentType`, `Context`, `DependencyList` and 58 more.
- `createPortal` (`@jgengine/core/ui/jsx/client.view`): ⚠ undocumented Also `Root`, `createRoot`, `flushSync`, `hydrateRoot`.
- `AllHTMLAttributes` (`@jgengine/core/ui/jsx/dom.view`): Every attribute of every tag, for the tags with no narrower set here. Also `AnchorHTMLAttributes`, `AnimationEvent`, `AnimationEventHandler`, `AriaAttributes`, `Attributes`, `AudioHTMLAttributes`, `ButtonHTMLAttributes`, `CanvasHTMLAttributes` and 56 more.
- `domHost` (`@jgengine/core/ui/jsx/domHost.view`): The host a DOM root renders through.
- `Children` (`@jgengine/core/ui/jsx/element`): ⚠ undocumented Also `AnyType`, `ClassInstance`, `ComponentClass`, `ContextType`, `ELEMENT`, `ElementType`, `Fragment`, `FunctionComponent` and 26 more.
- `Fragment` (`@jgengine/core/ui/jsx/jsx-dev-runtime`): ⚠ undocumented Also `jsx`, `jsxDEV`, `jsxs`.
- `Fragment` (`@jgengine/core/ui/jsx/jsx-runtime`): ⚠ undocumented Also `jsx`, `jsxDEV`, `jsxs`.
- `markupHost` (`@jgengine/core/ui/jsx/markup`): ⚠ undocumented Also `MarkupNode`, `renderToStaticMarkup`, `renderToString`, `renderToTree`, `styleText`, `treeToMarkup`.
- `Component` (`@jgengine/core/ui/jsx/reconciler`): Base class for the few class components (error boundaries). Also `ActionDispatch`, `AnyActionArg`, `Fiber`, `Host`, `PureComponent`, `Root`, `act`, `flushSync` and 17 more.
- `CSSProperties` (`@jgengine/core/ui/jsx/types`): An inline style object: CSS properties in camelCase, plus `--custom` properties. Also `ComponentClass`, `ComponentType`, `Context`, `DependencyList`, `Dispatch`, `EffectCallback`, `ElementType`, `ErrorInfo` and 19 more.
- `MirrorReport` (`@jgengine/core/ui/rune/cssMirror.view`): What the mirror could not express, counted by `property: value` and by where it was asked. Also `WireBox`, `boxOfElement`, `elementOf`, `idOf`, `mirrorContents`, `mirrorElement`, `mirrorRoot`, `onPaintResourceLoaded` and 4 more.
- `stateMatters` (`@jgengine/core/ui/rune/cssStates.view`): Whether marking `element` with the state's attribute would change how it or anything under it is styled. Also `twinStateRules`.
- `averageOfStops` (`@jgengine/core/ui/rune/cssValues`): The colour a gradient averages to: what a small repeated tile of it reads as. Also `WireDim`, `WireImageLayer`, `WireLayer`, `WireShadow`, `WireTextShadow`, `WireTrack`, `WireTransform`, `colorAlpha` and 17 more.
- `installRuneMeasure` (`@jgengine/core/ui/rune/domMeasure.view`): Make measurement of Rune-drawn elements answer from Rune's layout. Also `RuneScrollDriver`, `invalidateRuneLayout`, `runeRectOf`, `setRuneRect`, `setRuneScroll`.
- `compactPatches` (`@jgengine/core/ui/rune/patches`): Keep only attached replacement roots after all changes in one mirror pass.
- `RuneInput` (`@jgengine/core/ui/rune/runeInput.view`): ⚠ undocumented
- `RuneLayer` (`@jgengine/core/ui/rune/runeLayer.view`): Draws its children through Rune instead of the page: the elements exist (so styles, refs and events work as written) but the browser never lays them out or paints them; the Rune stage mirrors them onto its canvas over the game. Also `runeUiEnabled`.
- `RuneStage` (`@jgengine/core/ui/rune/runeStage.view`): ⚠ undocumented Also `registerRuneFont`.
- `VideoFrameSource` (`@jgengine/core/ui/rune/videoFrames.view`): The browser video methods used by a frame feed.
- `RuneScrollValues` (`@jgengine/core/ui/runeUi.view`): Scroll offset, viewport and content size in layout pixels.
- `mountGamePlayer` (`@jgengine/shell/mountGamePlayer`): Run a game inside any page: mounts the registry-driven player into `container` and returns the function that takes it down. Also `MountGamePlayerOptions`.
- `AccessibilityProvider` (`@jgengine/ui`): Apply accessibility preferences to a subtree: exposes `--jg-text-scale` for text to scale off, and sets `data-reduced-motion` / `data-high-contrast` / `data-colorblind` / `data-captions` for CSS to respond to. Also `AbilitySlotBindingOptions`, `AchievementGallery`, `AchievementGalleryProps`, `AchievementToast`, `AchievementToastProps`, `ActionBar`, `ActionBarChrome`, `ActionBarKeyResult` and 626 more.
- `EventfulEngineStore` (`@jgengine/ui/engineStore`): ⚠ undocumented Also `ReadableEngineStore`.
- `ENGINE_STYLESHEET` (`@jgengine/ui/engineStyles`): The engine stylesheet: every `jg-*` keyframe the shared blocks and registry components animate with, the `[data-jg-*]` interaction-state rules behind {@link HudButton} / {@link HudSurface}, the quiet hover/press/focus defaults for plain buttons inside the HUD root, and reduced-motion handling (`prefers-reduced-motion` or `[data-reduced-motion="true"]` zero `--jg-motion-scale`). Also `ensureEngineStyles`, `useEngineStyles`.
- `PerFrameRenderError` (`@jgengine/ui/hooks`): The error a component that re-renders every frame or tick from the store fails with in a dev build or test. Also `AbilitySlotBindingOptions`, `DomEventTarget`, `EventMeterView`, `GameClockControls`, `InventoryGridBinding`, `UseAxisChannelResult`, `WorldBrowserState`, `abilityKitNeedsHeartbeat` and 46 more.
- `GamePreviewComponent` (`@jgengine/ui/preview`): ⚠ undocumented Also `GamePreviewProps`, `GamePreviewStates`.
- `PREVIEW_FIXTURES` (`@jgengine/ui/previewFixtures`): Registry of deterministic, engine-level preview fixtures — the *real* exported `@jgengine/ui` components (`HudThemePreview`, `IconsPreview`, …) that render identically every time from static values, so they can be screenshotted as regression evidence without booting a game. Also `PreviewFixture`, `previewFixtureNames`, `resolvePreviewFixture`.
- `GameContextBridge` (`@jgengine/ui/provider`): Re-provide a captured {@link GameContext} across a nested React reconciler boundary. Also `GameProvider`, `useGameContext`, `useOptionalGameContext`.
- `selectionEqual` (`@jgengine/ui/selectSnapshot`): Whether two selections show the same thing: the same value, or arrays and plain objects whose entries are the same all the way down (a record or class instance compares by identity). Also `HotSelectionPace`, `SelectCache`.
- `useKeyedStore` (`@jgengine/ui/store`): Subscribe a component to one owner's slot of a typed keyed-family store defined with `defineKeyedStore`. Also `useStore`.
- `MENU_THEME_STYLE` (`@jgengine/ui/testFixtures`): Menu theme tokens passed through the `style` prop with no cast.

### Changed

- Unverified: LLMville main flow needs its local backend; framework-host and website demo browser checks remain pending. Rune fidelity is outside this React-removal landing. Performance was not measured

### Fixed

- convert game package declarations and browser fixtures, preserve static form selections, and remove stale React Three Fiber documentation

### Removed

- `@jgengine/react` no longer exports `AbilitySlotBindingOptions`, `AccessibilityProvider`, `AchievementGallery`, `AchievementGalleryProps`, `AchievementToast`, `AchievementToastProps`, `ActionBar`, `ActionBarChrome` and 627 more.
- `@jgengine/react/engineStore` no longer exports `EventfulEngineStore`, `ReadableEngineStore`.
- `@jgengine/react/engineStyles` no longer exports `ENGINE_STYLESHEET`, `ensureEngineStyles`, `useEngineStyles`.
- `@jgengine/react/hooks` no longer exports `AbilitySlotBindingOptions`, `DomEventTarget`, `EventMeterView`, `GameClockControls`, `InventoryGridBinding`, `PerFrameRenderError`, `UseAxisChannelResult`, `WorldBrowserState` and 47 more.
- `@jgengine/react/preview` no longer exports `GamePreviewComponent`, `GamePreviewProps`, `GamePreviewStates`.
- `@jgengine/react/previewFixtures` no longer exports `PREVIEW_FIXTURES`, `PreviewFixture`, `previewFixtureNames`, `resolvePreviewFixture`.
- `@jgengine/react/provider` no longer exports `GameContextBridge`, `GameProvider`, `useGameContext`, `useOptionalGameContext`.
- `@jgengine/react/selectSnapshot` no longer exports `HotSelectionPace`, `SelectCache`, `selectionEqual`.
- `@jgengine/react/store` no longer exports `useKeyedStore`, `useStore`.
- `@jgengine/react/testFixtures` no longer exports `MENU_THEME_STYLE`.
