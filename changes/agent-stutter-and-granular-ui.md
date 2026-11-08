HudFade watch and hold, and useHudAwake, take getters read every frame (watch={() => [air, suit]}, hold={() => alarm})

Engine seam: packages/core/src/buildings/InteriorDressing.draw.tsx, packages/core/src/devtools/frameBreakdown.draw.ts, packages/core/src/devtools/frameBreakdown.ts, packages/core/src/devtools/renderCounter.ts, packages/core/src/hud/hudLayout.view.tsx, packages/core/src/render/sceneSwap.draw.ts, packages/core/src/render/shaderWarmup.draw.ts, packages/core/src/ui/liveBind.view.tsx and 5 more

### Migrate

- HudFade watch and hold, and useHudAwake, take getters read every frame (watch={() => [air, suit]}, hold={() => alarm})
- useGameStoreLive is removed; use useGameStore (now shallow by default) or LiveText/useFrameBind for a value that changes every frame
- useStore and useGameStore compare selections shallowly by default; a selector returning a fresh object or array no longer re-renders every tick

### Added

- useSceneSwap and useSceneSwapping change place without a frozen frame, building the new place in the background behind a travel card
- prepareBeforeLink patches a lazily patched material (wet ground) before its first link, so a model that streams in mid-play compiles once
- `HitchScript` (`@jgengine/core/devtools/frameBreakdown`): One script the browser ran inside a slow frame, as its long-animation-frame timing names it. Also `HitchSession`.
- `installRenderCounter` (`@jgengine/core/devtools/renderCounter`): Install the counter as React's devtools hook on `scope`. Also `ComponentRenders`, `RenderCounter`, `RenderCounts`, `renderCounter`.
- `useSceneSwap` (`@jgengine/core/render/sceneSwap.draw`): Change place (a dive, a lift, a district, a level) without a frozen frame.
- `LiveTextTag` (`@jgengine/core/ui/liveBind.view`): Inline and block elements a live text can be.
- `sceneSwapping` (`@jgengine/core/ui/sceneSwap.view`): True while a scene swap's card is up, outside React (the frame breakdown marks stalls drawn behind it). Also `useSceneSwapping`.
- `shallowEqual` (`@jgengine/react/selectSnapshot`): Whether two selections show the same thing: the same value, or arrays or plain objects whose entries are each the same value.

### Fixed

- Deepward's half-second-plus stalls on dives, lifts and stratum changes, Harbor Heat's freeze getting into a car in the rain, and HUDs that re-rendered every panel every tick (Deepward React renders 8,192/s to 131/s; worst stall in browser long-play 8.2 s to 491 ms)

### Removed

- `@jgengine/core/ui/liveBind.view` no longer exports `frameBindSubscriberCount`.
- `@jgengine/react` no longer exports `useGameStoreLive`.
- `@jgengine/react/hooks` no longer exports `useGameStoreLive`.
