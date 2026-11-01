Added: Brightway Park, Odd Orbit and Ember Command ground from library scans, plus gulls and garden motes

Part of #2837

Engine seam: packages/assets/src/catalogs/materialLibrary.ts, packages/core/src/ambientFauna/ambientFaunaKind.ts

### Added

- Brightway Park: lawn `foliage/grass`, promenade and plazas `paving/plaza`, service paths `ground/gravel-fine` and back lots `ground/dirt-road` as terrain paint layers in `editor.scene.json`.
- Brightway Park: gulls soaring over the gate and the south shore from two `ambient_fauna` volumes. The catalog has no gull, so they are the Dove model (Poly by Google, CC-BY 3.0) tinted white; credited in `ART-CREDITS.md`.
- Odd Orbit: room floors from library scans, tinted to the pastel palette: `stone/terrazzo` living floor, `tile/ceramic` kitchen, `wood/floor` bedroom, `plastic/matte` work corner, `foliage/grass` garden bed.
- Odd Orbit: drifting motes and glowflies over the habitat garden from two `ambient_fauna` volumes.

### Fixed

- Ember Command roads use `ground/dirt-road` instead of packed dirt, and cliffs use `ground/cliff` instead of Rock022's `ground/rock`.

No before/after screenshots: cloud software GL fails to compile the world shader (`shoot ember-command --mode play` times out waiting for capture-ready), so evidence is tests, `check asset-availability concept-homes` and the editor RPC readbacks of the layer stacks.
