### Migrate

- Roads live in one folder per layer. Update deep imports:
  - `@jgengine/core/world/{roads,pathRoads,streets,streetGenerator,routeCourse,raceCircuit}` → `@jgengine/core/roads/…`.
  - `@jgengine/shell/environment/{RoadRibbons,RoadJunctions}` and `@jgengine/shell/terrain/surfaceRibbonMaterial` → `@jgengine/shell/roads/…`; the barrel is `@jgengine/shell/roads`.
  - `@jgengine/react/streetGeometryPreview` → `@jgengine/react/roads/streetGeometryPreview`.
- One junction builder: `buildTrimmedIntersections` + `buildIntersectionMarkings`. Removed the older parallel paths:
  - `buildJunctionPatch` (disc patch), `buildJunctionConnector`, `trimBandAtJunctions`/`BandTrimOptions`, `DashExclusion` and the `exclude` argument of `dashSegments`.
  - From `streets`: `laneCenters`/`StreetLane`, `curbPaths`, `junctionExclusions`, `junctionMarkings` (use `IntersectionMarkingIntent.crosswalk` / `stopLine`). `offsetPath` now comes from `@jgengine/core/roads/roads`.
- `pathLength` in the roads module is now `polylineLength` (`@jgengine/core/world` `pathLength` is still the path-follow one). The shell `terrain` barrel no longer re-exports the surface-ribbon material; import it from `@jgengine/shell/roads/surfaceRibbonMaterial`.

### Added

- `buildTrimmedIntersections` nodes mid-span crossings itself, and takes per-street `elevation` and per-junction `elevation`.
- `IntersectionMarkingIntent.crosswalk` with `crosswalkBars`, `crosswalkBarWidth`, `crosswalkDepth` and `crosswalkGap` on `buildIntersectionMarkings`: zebra crossings beyond the stop line.

### Changed

- Authored `road()` junctions in the shell now use the same builder as generated streets, so paved crossings get stop lines and zebra crossings from one place. A road authored with `markings: false` no longer gets stop lines or zebra bars painted at its crossings (Scrap Signal's dirt roads had them).
