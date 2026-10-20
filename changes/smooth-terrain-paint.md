### Added

- `EditableTerrain.gridBounds` (`@jgengine/core/world/terraform`) exposes the world extent of the paint/height cell grid.

### Fixed

- Authored terrain paint (paths, clearings, painted layers) now blends smoothly between neighbouring cells in the runtime ground and the editor sculpt view, instead of snapping each vertex to its 2 m cell and drawing grid-aligned stair-step edges. Unpainted cells blend toward the caller's base ground color, so painted edges fade into the terrain palette.
