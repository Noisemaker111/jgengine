Scripts, the UI registry, the dev, web and desktop apps and the host examples now type-check with the same strict flags as the engine packages. About 1000 errors fixed with guards and real types, no new casts.

Engine seam: packages/assets/src/assetStore.ts, packages/convex/src/resolveConvexMultiplayer.ts, packages/core/src/audio/engineLayers.ts, packages/core/src/chat/chatBubbles.view.ts, packages/core/src/devtools/saveEndpoint.ts, packages/core/src/flight/aircraftDynamics.ts, packages/core/src/leaderboard/leaderboard.ts, packages/core/src/map/map.view.tsx and 11 more

### Changed

- Scripts, the UI registry, the dev, web and desktop apps and the host examples now type-check with the same strict flags as the engine packages. About 1000 errors fixed with guards and real types, no new casts.
- optional fields on registry slot props (ActionBarSlot, ItemGridSlot, BuffChip), EditorAppProps, the ws host's listOpenServers args and a few core option types accept an explicit undefined.

### Fixed

- script readers of changelog headings, PNG headers and screenshot pixels no longer read past the end of their input.
