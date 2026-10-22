### Changed

- Static subtrees stop paying three's per-frame matrix pass. `freezeStaticTransforms` (`@jgengine/shell/render/staticTransforms`) bakes a subtree's world matrices once and clears `matrixAutoUpdate`/`matrixWorldAutoUpdate`; `thawStaticTransforms` puts it back for a seam that moves on an event. Batched static props and object/entity marker groups use it.
- Actor and object marker groups now own their matrix: the per-frame pose write recomposes only when the pose actually changed, so a parked prop or an idle actor leaves its subtree out of that frame's world-matrix pass. Moving actors are unchanged.
- A postfx prepass no longer re-walks the scene graph. `renderWithCurrentMatrices` (`@jgengine/shell/postfx/shadowPrepass`) draws the stylize normal prepass and the GTAO/DOF prepasses with the matrices the beauty pass built moments earlier in the same frame.

Harbor Heat: `updateMatrixWorld` 2.99 ms → 1.66 ms per frame.

### Added

- `freezeStaticTransforms` / `thawStaticTransforms` (`@jgengine/shell/render/staticTransforms`) keep authored scenery out of the per-frame matrix update.
