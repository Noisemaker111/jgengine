Markers authored at `y=0` were compared to the actor in 3D, so a marker on high ground was unreachable from the ground below it.

- Root cause: `reach`, `interact` and `left-area` measured a straight 3D distance to a point scenes author on a flat plan.
- `createMissionRuntime` takes `markerProximity`: `"horizontal"` (default) with a `tolerance` (default 8 m) vertical allowance, or `"spatial"` for a real 3D check. Horizontal is the default because the runtime only ever receives marker points and actor positions — it has no world or terrain handle to resolve a height from, so a plane it can already compute is the fix.
- All three marker comparisons share one allocation-free test, so ground below a marker neither blocks it nor trips a stay-near objective.
- Exports `MissionMarkerPlane`, `MissionMarkerProximity`, `DEFAULT_MARKER_TOLERANCE`; `api.md` regenerated.
- Games that resolved marker heights against the world can delete that and pass `missionMarkers(document)` as authored; no game in the engine checkouts uses `reach` yet, so that removal is the games' own follow-up.

`bun test src/mission` 51 pass (four new proximity tests: y=0 over a 6 m rise triggers from below, 40 m away does not; `spatial` rejects the same rise; tolerance boundary 3.999/4.001 of 4 m; `left-area` on the same plane). `bun --cwd=packages/core run check-types` clean. `bun run ship:preflight` ok.

Closes #2153

### Added

- `markerProximity` on `createMissionRuntime` picks the plane a marker proximity test compares in: `"horizontal"` (default) measures ground distance and allows the actor a `tolerance` (default 8 m) above or below the marker, `"spatial"` is the straight 3D check for worlds with stacked platforms. `MissionMarkerPlane`, `MissionMarkerProximity` and `DEFAULT_MARKER_TOLERANCE` are exported with it.

### Fixed

- `reach`, `interact` and the `left-area` fail condition compared a marker in 3D, so a marker authored at `y=0` under rising ground was unreachable. They now read the same plane.
