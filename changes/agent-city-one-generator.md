One city generator: the `city` scene kind (`@jgengine/core/city/cityKind`) is the only place a city grows. The playground's 3D city and street race now come from it, and the old `generateCity` is gone.

### Migrate

- `generateCity`, `resolveCityLotContent`, `GeneratedCity`, `CityPlot`, `ResolvedCityLot` and the rest of `@jgengine/core/city/cityGenerator` are gone. Use `resolveCityObject({ id, kind: "city", center, halfExtents, meta })`: street dials go in `meta` under their city-rule names (`segmentLength` → `blockSize`, `aspect` → `blockAspect`, `winding` → `curviness`, `width` → `streetWidth`); lot setback → `buildingRoadSetback`, spacing → `buildingSpacing`, `blockFill` → `roadsideOccupancy`, footprint → `lotScale`, `content.landmarks` → `landmarks`. The street graph is on `ResolvedCity.network`.
- `extractBlocks`, `FabricStreet`, `FabricParams` and `BlockRings` (`@jgengine/core/city/cityBlocks`) are gone. Use `extractGraphBlocks(network.nodes, network.edges, { sidewalkBase, curbMargin })`.
- `CityFillerClass` and `CITY_FILLER_CLASSES` are gone (nothing placed garages or depots any more).

### Added

- `landmarks` city rule (0..0.5, default 0): the share of buildable blocks given whole to one civic landmark (hall, arena, market or campus, picked by zone band). `CityLot.landmark` names it.
- `ResolvedCity.network`: the street graph the district grew from (plain data).
- `streetElevationField(rules, hx, hz)` (`@jgengine/core/roads/streetGenerator`): the road-surface field a network was draped over, rebuilt from seed, extents and the elevation dial.
- `GraphBlockRings.curb` and `GraphBlockEdge.sidewalk`.

### Changed

- City blocks are traced from the exact street graph instead of welding centerlines, so curved and filleted streets still close their blocks. Every city closes more blocks and places more buildings (the default district goes from 184 to 235 lots; Manhattan from 134 to 225). Apex Nights, Briarcrown, Ember Command, Hold the Line and Saltwick place city volumes and get the fuller fabric.
- Playground: "Lot frontage", "Lot depth" and "Plot variety" become one "Lot scale" dial (`?lotScale=`); "Landmarks" goes up to 0.5.

Verification:
- `bun test packages/core/src/city packages/core/src/roads packages/core/src/scatter packages/core/src/world apps/web/src/live apps/web/src/routes/-playground.test.ts`: pass
- `bun run check types`, `check concept-homes --all` (only the known TerrainMaterial): pass
- Playground in the browser: city and street race grow with buildings, an arena landmark, and the lap with kerbs and barriers
- `shoot apex-nights` and `shoot hold-the-line`: load and render normally

## Bends

- `cityKind.test.ts` pins the default district's lot counts; the pins move from 184/189 to 235/252 because the fabric now closes more blocks, which is the intended change.
- `cityLayout.ts` stays: it is Harbor Heat's authored road classes over the shared lot deriver, not a generator.
