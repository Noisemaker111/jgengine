### Migrate

- `groupStaticObjects` (`@jgengine/shell/world/staticObjectBatches`) takes an explicit `cell` argument (default `STATIC_BATCH_CELL`), and `STATIC_BATCH_CHUNK` is now `STATIC_BATCH_CELL`. `STATIC_BATCH_MIN` is 2. A caller that passed a chunk size to pick the grouping keeps working by passing it as the third argument.

### Changed

- Static authored/`scenery` props batch per model per 128 m cell with a minimum of 2, instead of per model per 64 m cell with a minimum of 3. Props spread thinner than the old minimum in their cell used to fall back to a full individual model draw — Harbor Heat drew 425 of its 488 props that way — and now join one instanced draw per material. Cell size stays configurable because one `InstancedMesh` has one bounding sphere, which three also frustum-tests in the shadow pass: a batch spanning the whole city submits every camera-visible instance to every shadow cascade (Harbor Heat +14% triangles), while 128 m keeps that rejection working (+1.1%).
- Culling stays per instance: the visibility predicate compacts each batch's drawn range every frame and the batch's bounding sphere is rebuilt from what it draws, so a batch with nothing in view contributes a draw of zero.

### Added

- `render/staticBatches` devtools system probe reports the grouped batches, the instances behind them, the draws submitted and the distinct instances drawn after culling, so batching and per-instance culling are visible in `debug_snapshot().systems`. `countStaticBatchDraws` (`@jgengine/shell/world/staticObjectBatches`) reads those counts from a live scene.
