### Migrate

- `SpatialGrid.forEachPair` now throws `RangeError` for negative or nonfinite distances. Pass a finite, nonnegative distance.

### Fixed

- Spatial pair queries include qualifying pairs across every cell covered by the requested distance, including distances larger than the grid cell size.
