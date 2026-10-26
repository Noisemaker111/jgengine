Instanced drawing has one home. Every renderer that fills an `InstancedMesh` (scatter, buildings, city props, pole lines, interior dressing, authored shapes, fire, birds, data charts, grid worlds, tile layers, and the Deepward and LLMVille scenery) now writes through one upload that sets transforms, colors, draw count and culling bounds the same way, and big batches split into spatial cells through one partition. The ten hand-rolled copies are gone.

### Added

- `uploadInstances(mesh, source, options)` (`@jgengine/shell/instancing/instanceUpload`): writes a list of matrices or a `{ count, at }` writer into a mesh, grows its buffers when needed, and reports the count to the draw probes. Knobs: `localMatrix` (a model part's own transform), `colors` (list or writer), `bounds` (`"sphere"`, `"boxes"` with `boundsPad`, a known `Box3`, or `"none"`), `dynamic` (per-frame buffers).
- `composeInstance(out, position, rotation, scale)`: one instance matrix from plain arrays.
- `partitionInstances(geometry, matrices, { localMatrix, cellSize })` (`@jgengine/shell/instancing/instanceChunks`): splits a batch into XZ cells that cull as units; a batch that fits one cell stays one draw.
- `groupInstancesByCell(items, cellSize, at)` (`@jgengine/core/instancing/instanceCells`): the plain cell grouping both scatter and buildings use.

### Changed

- `StaticShapeInstances` moved to `@jgengine/shell/instancing/staticShapeInstances`; `placeAlongPath` moved to `@jgengine/core/instancing/pathInstances`.
- Scatter, impostor scatter, buildings, building kits, city furniture/trees/vehicles/signals, pole lines, interior decals, fire spread, the living-world flock, `DataObjects`, `GridWorldScene` and `TileLayerRenderer` draw through `uploadInstances`.
- Beacon Bastion, Deepward and LLMVille import the new homes; Deepward's station batches and LLMVille's endless datacenter upload through `uploadInstances`.

### Removed

- `buildingSpatialBatch` (replaced by `partitionInstances`), `chunkScatterInstances` / `ScatterChunk` (replaced by `groupInstancesByCell`).

Bends:
- Left on their own writers: `InstancedBodies` and `SpriteBatch` (per-frame packed-array hot loops over thousands of bodies), `staticObjectBatches` (skips the upload when nothing moved), `ImpostorCardPool` (packs many slices into one shared mesh), `crowdBatch` / `SkinnedInstances` (the crowd concept) and `ImpactFeedback` (combat feedback, another builder's area).
- `GridWorldScene` now computes a culling sphere where it had none.

Verification:
- `bun run check types`, `bun run gen` (all stages pass), `bun test packages/shell/src packages/core/src`.
- Play shots: Apex Nights and Hold the Line (city lamps, trees, cars), Beacon Bastion (authored plot shapes, forest), Deepward (station batches), Fernwild (scatter) all render as before.
- Load guard passes for Apex Nights, Hold the Line, Deepward, Fernwild and Beacon Bastion (Beacon Bastion failed once while other heavy jobs ran on the machine, then passed twice alone).
- Unverified: LLMVille's endless datacenter on screen (it needs its Convex backend to run); it type-checks.
