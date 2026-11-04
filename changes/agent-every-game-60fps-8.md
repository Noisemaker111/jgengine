Auto exposure reads its light meter back at the start of a frame instead of after the scene, so it no longer stalls the frame for 7-118 ms while the browser finishes drawing.

Engine seam: packages/core/src/devtools/frameBreakdown.draw.ts, packages/core/src/lighting/CascadedShadows.draw.tsx, packages/core/src/postfx/PostProcessing.draw.tsx, packages/core/src/postfx/autoExposure.draw.ts, packages/core/src/terrain/groundEdgeFade.draw.ts

### Fixed

- Auto exposure reads its light meter back at the start of a frame instead of after the scene, so it no longer stalls the frame for 7-118 ms while the browser finishes drawing.
- When the camera pans, at most one far shadow cascade redraws per frame (the longest waiting first) instead of all of them on the same frame.
- City ground layers with an edge fade draw in one pass instead of re-flagging their material twice every frame.
- Ember Command's HUD no longer re-renders every frame for a mission clock that changes once a second, and its minimap fog is built once per fog change as one rectangle per run of cells.
- The perf breakdown's own per-draw bookkeeping no longer allocates, so the garbage it reports is the game's.
