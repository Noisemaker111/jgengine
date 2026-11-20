Every game's from-zero flow runs headless in its tests (9 of 10; LLMville is browser-only until step 6)

Engine seam: packages/core/src/ai/AuthoredFlocks.draw.tsx, packages/core/src/anim/CharacterCrowd.draw.tsx, packages/core/src/anim/CorpseRagdolls.draw.tsx, packages/core/src/anim/characterMotion.view.ts, packages/core/src/anim/tweenNumber.view.tsx, packages/core/src/anim/useEntityRenderCues.draw.ts, packages/core/src/anim/useModelAnimation.draw.ts, packages/core/src/audio/AudioComponents.draw.tsx and 190 more

### Added

- `CharacterMotionContext` (`@jgengine/core/anim/characterMotion.view`): The game's own character-motion layer (`scene.characterMotion`); the shell provides it. Also `drawCharacterMotion`, `noteGameCharacterMotion`, `useCharacterMotion`.
- `PlayerFovProvider` (`@jgengine/core/camera/PlayerFov.view`): Provides the player's saved FOV preference to the camera rigs and settings UI below it. Also `PlayerFovSlider`, `PlayerFovState`, `usePlayerFov`.
- `flushAfterRenderTasks` (`@jgengine/core/frame/afterRenderBoard`): Run every task joined with {@link joinAfterRenderTask}, in join order. Also `flushBeforeRenderTasks`, `joinAfterRenderTask`, `joinBeforeRenderTask`.
- `getGeneratorPreview` (`@jgengine/core/generator/generatorPreview.view`): The preview registered for an output family, or undefined when that family has none. Also `GeneratorPreview`, `GeneratorPreviewFrame`, `GeneratorPreviewProps`, `registerGeneratorPreview`.
- `NameplateSample` (`@jgengine/core/hud/barSamples.view`): Projected nameplate with optional health and distance from the render camera. Also `Projectable`, `WorldBarSample`, `WorldOverlayCamera`, `WorldOverlaySampleOptions`.
- `createMouseLookTracker` (`@jgengine/core/input/mouseLook.view`): ⚠ undocumented Also `MouseLookAim`, `MouseLookOptions`, `MouseLookTracker`.
- `bakeTerrainMap` (`@jgengine/core/map/terrainMap.view`): Bake a top-down image of a `TerrainField` (or `RegionField`) over `bounds` for the react `Minimap` / `WorldMap` background. Also `BakeTerrainMapOptions`, `BakedMap`, `MapBakeBounds`.
- `runFlowHeadless` (`@jgengine/core/play/headlessFlow.view`): ⚠ undocumented Also `HeadlessFlowOptions`.
- `HeadlessKeys` (`@jgengine/core/play/headlessKeys`): Keys held against a headless {@link PlaySession}, mapped through the game's own bindings.
- `createPlaySession` (`@jgengine/core/play/playSession`): Boot a `PlayableGame` through the headless runner and tick it the way the shell does: movement from held actions, then the per-frame action phase (bound commands, prompts, hotbar). Also `PlaySession`, `PlaySessionOptions`.
- `ScreenEffectsOverlay` (`@jgengine/core/postfx/ScreenEffectsOverlay.view`): A DOM overlay that renders a {@link ScreenEffectsController} as full-screen color-grade layers over the game canvas — damage vignettes, heal flashes, a sustained low-health pulse — through the shell's postfx overlay layer, so a game gets screen feedback without hand-rolling shader or overlay timing. Also `ScreenEffectsOverlayProps`.
- `useDisposable` (`@jgengine/core/render/useDisposable.view`): Memoize a three.js resource (or tuple of resources) and dispose it when `deps` change or the component unmounts. Also `Disposable`.
- `playReplayRecording` (`@jgengine/core/replay/replayPlayback`): Play an {@link ReplayRecording} headless against a new world from the same game and seed: boot a new game (unless `boot: false`), then each frame's commands, look and held actions at the frame's own time. Also `ReplayPlayback`.
- `nextFrame` (`@jgengine/core/run/nextFrame.view`): Resolves on the next animation frame, or a zero-delay timer in tests and SSR.
- `registerSceneKindRenderer` (`@jgengine/core/scene/sceneKindRenderers.view`): Register the runtime renderer for a scene kind — the shell half of the #809 seam. Also `SceneKindRenderContext`, `SceneKindRenderer`.
- `AudioSettingsBridge` (`@jgengine/core/settings/appliedSettings.view`): ⚠ undocumented Also `AppliedGraphicsSettings`, `TOUCH_STYLE_AUTO`, `useGraphicsSettings`, `useSettingsRevision`.
- `defineGame` (`@jgengine/core/shell/defineGame.draw`): The one public authoring entry point: compose engine fields (systems, world, physics, input) and presentation fields (camera, HUD, audio, authored scene) into a `PlayableGame` ready for `GameHost`. Also `GameConfig`.
- `FrameDriver` (`@jgengine/core/shell/drivers/FrameDriver.draw`): ⚠ undocumented Also `POSTER_SETTLE_SECONDS`.
- `GameHost` (`@jgengine/core/shell/GameHost.draw`): The one documented mount: resolves multiplayer for the playable and renders the shell. Also `EditorSummonModule`, `GameHostProps`.
- `Clock` (`@jgengine/core/shell/gameKit.draw`): A time-of-day clock reading the sim calendar — `Day N · HH:MM`, 24h or 12h. Also `Coins`, `DEFAULT_DRIVE_CODES`, `DEFAULT_WALK_CODES`, `EditorCatalogDefinition`, `EditorDocument`, `EditorSummonModule`, `GameCameraConfig`, `GameConfig` and 25 more.
- `GamePhaseStamp` (`@jgengine/core/shell/GamePhaseStamp.view`): ⚠ undocumented
- `GamePlayerProps` (`@jgengine/core/shell/GamePlayer.draw`): ⚠ undocumented
- `resolvePhysicsTuning` (`@jgengine/core/shell/GamePlayerShell.draw`): Maps a game's declared `physics` onto the movement controllers' tuning.
- `GameUiPreview` (`@jgengine/core/shell/GameUiPreview.draw`): ⚠ undocumented Also `UiPreviewScenario`, `defaultUiScenario`.
- `mountGamePlayer` (`@jgengine/core/shell/mountGamePlayer.draw`): Run a game inside any page: mounts the registry-driven player into `container` and returns the function that takes it down. Also `MountGamePlayerOptions`.
- `resolveGameLoader` (`@jgengine/core/shell/registry.draw`): ⚠ undocumented Also `GameErrorScreenProps`, `GameHealth`, `GameRegistry`, `PlayableGame`, `RenderEntity`, `RenderObject`.
- `EMPTY_RESERVED` (`@jgengine/core/shell/shellConstants`): No action names are reserved when no camera rig is active (hud/none presentation): games may bind `turnLeft`/`interact`/etc. Also `NO_ACTIONS`.
- `useRuntimeHealth` (`@jgengine/core/shell/useRuntimeHealth.draw`): Wire the game's `health` config for one session: the crash seam (with window error and unhandled-rejection handlers), the telemetry queue, and auto quality.
- `GridWorldScene` (`@jgengine/core/shell/world/GridWorldScene.draw`): Data-driven renderer for the `biomes()`/`voxel()`/`plots()`/`tilemap()` world-feature kinds (#207.1): one `InstancedMesh` of extruded, colored boxes built from each feature's declared `cells`, uploaded through the shared instance upload. Also `GridWorldSceneProps`.
- `WorldEntityFrames` (`@jgengine/core/shell/world/WorldEntityFrames.draw`): Mounts inside the scene, samples the live camera each frame (throttled by `tickMs`), and renders `@jgengine/core/ui.view`'s {@link EntityFrames} through a fullscreen UI overlay. Also `WorldEntityFramesProps`, `projectWorldToScreen`, `useWorldProjection`.
- `RemotePlayers` (`@jgengine/core/shell/world/WorldScene.draw`): ⚠ undocumented Also `WorldView`, `drawsScaledModel`.
- `runGameSuite` (`@jgengine/core/suite/runSuiteProof.view`): Run a game's whole suite: every proof, then the content check. Also `LoadedSuiteProof`, `SuiteProofRun`, `SuiteProofRunOptions`, `runSuiteProof`.
- `TerrainQualityContext` (`@jgengine/core/terrain/terrainQuality.view`): The player's graphics tier as terrain materials see it; the shell provides it, `high` outside one. Also `noteTerrainQuality`, `terrainQuality`, `useTerrainQuality`.
- `TERRAIN_SCAN_SIZE` (`@jgengine/core/terrain/terrainScanMaps.view`): Largest edge a scan is packed at; ambientCG 1K archives are 1024 square. Also `TerrainScanPixels`.
- `AccessibilityProvider` (`@jgengine/core/ui.view`): Apply accessibility preferences to a subtree: exposes `--jg-text-scale` for text to scale off, and sets `data-reduced-motion` / `data-high-contrast` / `data-colorblind` / `data-captions` for CSS to respond to. Also `AbilitySlotBindingOptions`, `AchievementGallery`, `AchievementGalleryProps`, `AchievementToast`, `AchievementToastProps`, `ActionBar`, `ActionBarChrome`, `ActionBarKeyResult` and 625 more.
- `EventfulEngineStore` (`@jgengine/core/ui/engineStore.view`): ⚠ undocumented Also `ReadableEngineStore`.
- `ENGINE_STYLESHEET` (`@jgengine/core/ui/engineStyles.view`): The engine stylesheet: every `jg-*` keyframe the shared blocks and registry components animate with, the `[data-jg-*]` interaction-state rules behind {@link HudButton} / {@link HudSurface}, the quiet hover/press/focus defaults for plain buttons inside the HUD root, and reduced-motion handling (`prefers-reduced-motion` or `[data-reduced-motion="true"]` zero `--jg-motion-scale`). Also `ensureEngineStyles`, `useEngineStyles`.
- `PerFrameRenderError` (`@jgengine/core/ui/hooks.view`): The error a component that re-renders every frame or tick from the store fails with in a dev build or test. Also `AbilitySlotBindingOptions`, `DomEventTarget`, `EventMeterView`, `GameClockControls`, `InventoryGridBinding`, `UseAxisChannelResult`, `WorldBrowserState`, `abilityKitNeedsHeartbeat` and 46 more.
- `GamePreviewComponent` (`@jgengine/core/ui/preview`): ⚠ undocumented Also `GamePreviewProps`, `GamePreviewStates`.
- `PREVIEW_FIXTURES` (`@jgengine/core/ui/previewFixtures.view`): Registry of deterministic, engine-level preview fixtures — the *real* exported `@jgengine/core/ui.view` components (`HudThemePreview`, `IconsPreview`, …) that render identically every time from static values, so they can be screenshotted as regression evidence without booting a game. Also `PreviewFixture`, `previewFixtureNames`, `resolvePreviewFixture`.
- `GameContextBridge` (`@jgengine/core/ui/provider.view`): Re-provide a captured {@link GameContext} across a nested UI reconciler boundary. Also `GameProvider`, `useGameContext`, `useOptionalGameContext`.
- `selectionEqual` (`@jgengine/core/ui/selectSnapshot.view`): Whether two selections show the same thing: the same value, or arrays and plain objects whose entries are the same all the way down (a record or class instance compares by identity). Also `HotSelectionPace`, `SelectCache`.
- `useKeyedStore` (`@jgengine/core/ui/store.view`): Subscribe a component to one owner's slot of a typed keyed-family store defined with `defineKeyedStore`. Also `useStore`.
- `MENU_THEME_STYLE` (`@jgengine/core/ui/testFixtures.view`): Menu theme tokens passed through the `style` prop with no cast.

### Changed

- Every game's from-zero flow runs headless in its tests (9 of 10; LLMville is browser-only until step 6)
- README code samples compile as written
- The perf gate reports inside, over and not judged, and names the build
- jgengine has says gap instead of the nearest wrong match
- Brightway Park: guests arrive faster and scenario one asks for 250 rating, so a steady player wins it
- The compiler checks each layer; ui and shell are in core

### Fixed

- Ember Command's Continue on a fresh slot sets up the skirmish

### Removed

- `@jgengine/core/anim/characterMotion.draw` no longer exports `CharacterMotionContext`, `drawCharacterMotion`, `noteGameCharacterMotion`, `useCharacterMotion`.
- `@jgengine/core/camera/PlayerFov.draw` no longer exports `PlayerFovProvider`, `PlayerFovSlider`, `PlayerFovState`, `usePlayerFov`.
- `@jgengine/core/frame/afterRenderBoard.draw` no longer exports `flushAfterRenderTasks`, `flushBeforeRenderTasks`, `joinAfterRenderTask`, `joinBeforeRenderTask`.
- `@jgengine/core/generator/generatorPreview.draw` no longer exports `GeneratorPreview`, `GeneratorPreviewFrame`, `GeneratorPreviewProps`, `getGeneratorPreview`, `registerGeneratorPreview`.
- `@jgengine/core/hud/barSamples.draw` no longer exports `NameplateSample`, `Projectable`, `WorldBarSample`, `WorldOverlayCamera`, `WorldOverlaySampleOptions`.
- `@jgengine/core/input/mouseLook.draw` no longer exports `MouseLookAim`, `MouseLookOptions`, `MouseLookTracker`, `createMouseLookTracker`.
- `@jgengine/core/map/terrainMap.draw` no longer exports `BakeTerrainMapOptions`, `BakedMap`, `MapBakeBounds`, `bakeTerrainMap`.
- `@jgengine/core/play/headlessFlow.draw` no longer exports `HeadlessFlowOptions`, `runFlowHeadless`.
- `@jgengine/core/play/headlessKeys.draw` no longer exports `HeadlessKeys`.
- `@jgengine/core/play/playSession.draw` no longer exports `PlaySession`, `PlaySessionOptions`, `createPlaySession`.
- `@jgengine/core/postfx/ScreenEffectsOverlay.draw` no longer exports `ScreenEffectsOverlay`, `ScreenEffectsOverlayProps`.
- `@jgengine/core/render/useDisposable.draw` no longer exports `Disposable`, `useDisposable`.
- `@jgengine/core/replay/replayPlayback.draw` no longer exports `ReplayPlayback`, `playReplayRecording`.
- `@jgengine/core/run/nextFrame.draw` no longer exports `nextFrame`.
- `@jgengine/core/scene/sceneKindRenderers.draw` no longer exports `SceneKindRenderContext`, `SceneKindRenderer`, `registerSceneKindRenderer`.
- `@jgengine/core/settings/appliedSettings.draw` no longer exports `AppliedGraphicsSettings`, `AudioSettingsBridge`, `TOUCH_STYLE_AUTO`, `useGraphicsSettings`, `useSettingsRevision`.
- `@jgengine/core/suite/runSuiteProof.draw` no longer exports `LoadedSuiteProof`, `SuiteProofRun`, `SuiteProofRunOptions`, `runGameSuite`, `runSuiteProof`.
- `@jgengine/core/terrain/terrainQuality.draw` no longer exports `TerrainQualityContext`, `noteTerrainQuality`, `terrainQuality`, `useTerrainQuality`.
- `@jgengine/core/terrain/terrainScanMaps.draw` no longer exports `TERRAIN_SCAN_SIZE`, `TerrainScanPixels`.
- `@jgengine/shell/defineGame` no longer exports `GameConfig`, `defineGame`.
- `@jgengine/shell/drivers/FrameDriver` no longer exports `FrameDriver`, `POSTER_SETTLE_SECONDS`.
- `@jgengine/shell/GameHost` no longer exports `EditorSummonModule`, `GameHost`, `GameHostProps`.
- `@jgengine/shell/gameKit` no longer exports `Clock`, `Coins`, `DEFAULT_DRIVE_CODES`, `DEFAULT_WALK_CODES`, `EditorCatalogDefinition`, `EditorDocument`, `EditorSummonModule`, `GameCameraConfig` and 26 more.
- `@jgengine/shell/GamePhaseStamp` no longer exports `GamePhaseStamp`.
- `@jgengine/shell/GamePlayer` no longer exports `GamePlayerProps`.
- `@jgengine/shell/GamePlayerShell` no longer exports `resolvePhysicsTuning`.
- `@jgengine/shell/GameUiPreview` no longer exports `GameUiPreview`, `UiPreviewScenario`, `defaultUiScenario`.
- `@jgengine/shell/mountGamePlayer` no longer exports `MountGamePlayerOptions`, `mountGamePlayer`.
- `@jgengine/shell/registry` no longer exports `GameErrorScreenProps`, `GameHealth`, `GameRegistry`, `PlayableGame`, `RenderEntity`, `RenderObject`, `resolveGameLoader`.
- `@jgengine/shell/shellConstants` no longer exports `EMPTY_RESERVED`, `NO_ACTIONS`.
- `@jgengine/shell/useRuntimeHealth` no longer exports `useRuntimeHealth`.
- `@jgengine/shell/world/GridWorldScene` no longer exports `GridWorldScene`, `GridWorldSceneProps`.
- `@jgengine/shell/world/WorldEntityFrames` no longer exports `WorldEntityFrames`, `WorldEntityFramesProps`, `projectWorldToScreen`, `useWorldProjection`.
- `@jgengine/shell/world/WorldScene` no longer exports `RemotePlayers`, `WorldView`, `drawsScaledModel`.
- `@jgengine/ui` no longer exports `AbilitySlotBindingOptions`, `AccessibilityProvider`, `AchievementGallery`, `AchievementGalleryProps`, `AchievementToast`, `AchievementToastProps`, `ActionBar`, `ActionBarChrome` and 626 more.
- `@jgengine/ui/engineStore` no longer exports `EventfulEngineStore`, `ReadableEngineStore`.
- `@jgengine/ui/engineStyles` no longer exports `ENGINE_STYLESHEET`, `ensureEngineStyles`, `useEngineStyles`.
- `@jgengine/ui/hooks` no longer exports `AbilitySlotBindingOptions`, `DomEventTarget`, `EventMeterView`, `GameClockControls`, `InventoryGridBinding`, `PerFrameRenderError`, `UseAxisChannelResult`, `WorldBrowserState` and 47 more.
- `@jgengine/ui/preview` no longer exports `GamePreviewComponent`, `GamePreviewProps`, `GamePreviewStates`.
- `@jgengine/ui/previewFixtures` no longer exports `PREVIEW_FIXTURES`, `PreviewFixture`, `previewFixtureNames`, `resolvePreviewFixture`.
- `@jgengine/ui/provider` no longer exports `GameContextBridge`, `GameProvider`, `useGameContext`, `useOptionalGameContext`.
- `@jgengine/ui/selectSnapshot` no longer exports `HotSelectionPace`, `SelectCache`, `selectionEqual`.
- `@jgengine/ui/store` no longer exports `useKeyedStore`, `useStore`.
- `@jgengine/ui/testFixtures` no longer exports `MENU_THEME_STYLE`.
