### Migrate

- Scatter lives in one folder per layer: `@jgengine/core/world/{scatter,scatterRegion,scatterCoverage}` → `@jgengine/core/scatter/…` (the shell side is already `@jgengine/shell/scatter`).
- Removed `@jgengine/core/world/scatterItems` (`scatterItems`, `ScatterLayer` and its `ScatterInstance`), which nothing used. `ScatterInstance` is the scatter-region one.
- Polygon helpers have one home: `@jgengine/core/world/cityGeometry` → `@jgengine/core/world/polygon`. `scatterRegion` no longer exports `pointInPolygon`, `polygonArea`, `polygonBounds` or `distanceToPolygonEdge`; use `pointInPolygon(ring, x, z)`, `polygonArea`, `ringBounds` and `distanceToRing(ring, x, z)` from `@jgengine/core/world/polygon`.
- Scatter regions pick their palette item with the shared `pickWeighted` from `@jgengine/core/random/pick`.
