### Fixed

- A prop placed at runtime honours its model's `variants` levels. `StaticObjectModels` applied the level switch only inside its batched branch, so a prop placed with `scene.object.place` — Harbor Heat's palm line — drew its full asset at every camera distance: 15 palms at 9,134 triangles each, and pointing the far level at a dispatch booth changed nothing on screen. `IsolatedEntityModel` now mounts `SingleVariantModel`, which asks the same `createModelVariantSelector` and `lodBandIndex` authority the batched path uses, at the prop's own camera distance, and keeps only the active level mounted so both levels never draw at once. The switch carries the selector's hysteresis, warms every level at mount, measures only the near level, and reads the placement from the scene store through scratch vectors, so a frame allocates nothing. One palm past 60 m draws 4,110 triangles instead of 9,134 (5,024 saved, 45% of the full level).

- `singleVariantLevel` and `singleVariantModel` (`@jgengine/shell` internal, `render/singleVariantLod`) are the isolated path's level decision and the model it draws, so a fixture pins the same switch the component runs.

`bun test packages/shell/src/render/singleVariantLod.test.ts` — 6 pass. With the old render decision restored, the wiring test fails (`Expected: SingleVariantModel, Received: EntityModel`).
`bun --cwd=packages/shell run test` — 1,229 pass, 0 fail.
`bun --cwd=packages/shell run check-types` — clean.
