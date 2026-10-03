### Fixed

- Terrain blend authoring adds new layers and paints in one undoable edit; failed brushes preserve the document and redo history. Layer reorder/additions preserve existing blends by id.
- Terrain RPC rejects invalid brush/dimension/ramp input and oversized allocations with actionable diagnostics.
- Viewport placement honors grid snap, paths select along their segments, and multi-selection gizmos translate the whole group consistently.
- Oversized terrain brushes bound work to the actual grid; native standalone editor captures now arm the existing readiness handshake and report load failures.
- Terrain-only authored scenes now frame their footprint and relief without a dummy marker.
- Terrain mesh changes invalidate the on-demand viewport so brush/undo/RPC edits appear without another input.
