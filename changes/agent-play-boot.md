Games on jgengine.com load every model, and every game opens through one loading sequence

Engine seam: packages/core/src/assets/assetBase.draw.ts, packages/core/src/assets/assetBase.ts, packages/core/src/audio/audioEngine.view.ts, packages/core/src/boot/BootDirector.draw.tsx, packages/core/src/boot/assetPrefetch.ts, packages/core/src/boot/bootScreen.view.tsx, packages/core/src/boot/bootSequence.ts, packages/core/src/boot/prefetchTier.ts and 9 more

### Added

- `pagePrefetch` (`@jgengine/core/boot/assetPrefetch`): The page's prefetch: one game per page, started when the game opens. Also `AssetPrefetch`, `PrefetchState`.
- `ENTER_QUIET_MS` (`@jgengine/core/boot/BootDirector.draw`): How long the model loader must stay idle after Play before the entering screen lifts. Also `BootSignals`.
- `bootLoadingAreas` (`@jgengine/core/boot/bootScreen.view`): How many world pieces are still loading; Play waits on the entering screen until none are. Also `useBootStep`.
- `BOOT_SEQUENCE_ATTRIBUTE` (`@jgengine/core/boot/bootSequence`): The page attribute a boot is stamped on, for a check that reads a running game. Also `BOOT_STEPS`, `BootSequence`, `BootSequenceState`, `BootStep`, `pageBoot`.
- `orderPrefetch` (`@jgengine/core/boot/prefetchTier`): Order a list near tier first, keeping each tier's own order and dropping repeats. Also `PrefetchItem`, `PrefetchTier`.

### Changed

- Games on jgengine.com load every model, and every game opens through one loading sequence
- Cause: the production /play build never copied each game's public/ folder (only the dev server served it), so models 404'd on the live site and two scatter loaders crashed hold-the-line on a 404. Each game's files now ship under /play/games/<id>/, with a per-game file list the runner loads from; a .glb or .gltf's own textures resolve there too.
- Release gate: scripts/check-site-assets.ts runs before every site deploy and fails on any model, texture, sound, pack or model texture a game names that the build lacks.
- The dev missing-models overlay and placeholder labels never show in production.
- One boot sequence (open > loading > intro > menu > entering > playing) drives every loading surface: one jgengine loading screen, no second loading screen or flash. A game's files start downloading in the background the moment it opens, near files first and distance/LOD files after; Play enters at once when they are in, else shows the loading screen with real file progress. The page stamps the sequence as data-jg-boot, and bun run shoot --load fails a game whose sequence repeats or goes backwards or whose files 404.
- Migration: resolveAssetBaseUrl moved from @jgengine/core/assets/assetBase.draw to @jgengine/core/assets/assetBase; installAssetBase stays in assetBase.draw.

### Removed

- `@jgengine/core/play/flow` no longer exports `BrowserFlow`, `BrowserFlowSpec`, `BrowserProofFlow`, `FLOW_PRESS_MS`, `FLOW_WAIT_MS`, `Flow`, `FlowCommandResult`, `FlowHold` and 8 more.
- `@jgengine/core/play/flowSteps` no longer exports `FlowFailure`, `FlowRunReport`, `FlowStepRecord`, `FlowStepper`.
- `@jgengine/core/play/headlessFlow.draw` no longer exports `HeadlessFlowOptions`, `runFlowHeadless`.
- `@jgengine/core/play/playSession.draw` no longer exports `PlaySession`, `PlaySessionOptions`, `createPlaySession`.
