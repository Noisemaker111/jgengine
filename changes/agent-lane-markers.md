### Added

- `markerProximity` on `createMissionRuntime` picks the plane a marker proximity test compares in: `"horizontal"` (default) measures ground distance and allows the actor a `tolerance` (default 8 m) above or below the marker, `"spatial"` is the straight 3D check for worlds with stacked platforms. `MissionMarkerPlane`, `MissionMarkerProximity` and `DEFAULT_MARKER_TOLERANCE` are exported with it.

### Fixed

- `reach`, `interact` and the `left-area` fail condition compared a marker in 3D, so a marker authored at `y=0` under rising ground was unreachable. They now read the same plane.
