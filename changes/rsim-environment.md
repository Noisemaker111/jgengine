one reference-grade wind field read by grass, weather and boats, forests and ground cover placed by the stand model from editor scene kinds, granular soil that ruts, and a landform start option in jgengine create, each a named effect with a 0-upward dial

### Added

- one reference-grade wind field read by grass, weather and boats, forests and ground cover placed by the stand model from editor scene kinds, granular soil that ruts, and a landform start option in jgengine create, each a named effect with a 0-upward dial
- `createSoftGround` (`@jgengine/core/granular/softGround`): Lay soft ground over a terrain's vertex grid. Also `SoftGround`, `SoftGroundOptions`, `SoftGroundSnapshot`, `SoftGroundWheel`, `SoftSurfaceClass`, `softSurfaceSoil`.
- `GRASS_WIND_REFERENCE_SPEED` (`@jgengine/core/grass/grassWind`): Wind speed, m/s, a grass kind's `windStrength` was tuned to: a gentle-to-moderate breeze (Beaufort 3–4). Also `GRASS_WIND_SAMPLE_HEIGHT`, `GrassWind`, `GrassWindLook`, `grassSwayAmplitude`, `grassWindAt`, `grassWindLook`.
- `LANDFORM_START_PARAMS` (`@jgengine/core/landform/generator/landformStart`): Each start's generator params, about a 960 m map: a range cut by rivers then worked by ice above its snowline, a sand sea under one wind, and a river-cut range drowned to a coast. Also `landformStartTerrain`, `withGeneratedTerrain`.
- `GLACIAL_PHASE_YEARS` (`@jgengine/core/landform/generator/landformTerrain`): Years glaciers work a range when a recipe has a `glacierEla`.
- `AIR_DENSITY` (`@jgengine/core/physics/boatWindage`): Sea-level air density, kg/m³ (ISA). Also `BoatWind`, `boatWindageForce`.
- `DrivableSoil` (`@jgengine/core/physics/drivableVehicle`): Soft ground a car's wheels rut, and the wheel size they press with.
- `GROUND_COVER_FIELD_KIND` (`@jgengine/core/plants/groundCover/groundCoverField`): The editor volume kind a ground-cover field is placed as. Also `GROUND_COVER_SCHEMA`, `GroundCoverParams`, `growGroundCoverLook`, `resolveGroundCoverObject`.
- `FOREST_STAND_KIND` (`@jgengine/core/plants/stand/forestStand`): The editor path kind a forest stand is drawn as. Also `FOREST_STAND_SCHEMA`, `FOREST_STAND_TREE_BUDGET`, `ForestStandParams`, `ForestStandPlot`, `ForestStandTree`, `growForestStandPlot`, `readForestStandParams`, `resolveForestStand`.
- `registerScatterSource` (`@jgengine/core/scatter/scatterRegion`): Register the {@link ScatterSource} for a path kind; idempotent, last registration wins. Also `ScatterSource`.
- `LANDFORM_STARTS` (`@jgengine/core/terrain/terrainGenerator`): The plain data a document stores to have its ground grown on first load; `landform/generator/landformStart` grows it. Also `EditorTerrainGenerator`, `LandformStart`.
- `WEATHER_WIND_SAMPLE_HEIGHT` (`@jgengine/core/weather/weatherUniforms.draw`): Height, m, precipitation reads the shared wind at: the meteorological 10 m.
- `WIND_SURFACE_ROUGHNESS` (`@jgengine/core/world/windEffects`): EN 1991-1-4 Table 4.1: z₀ and z_min per terrain category. Also `PreparedWindEffects`, `WindEffects`, `WindGustEffect`, `WindGustSynthesis`, `WindProfileEffect`, `WindSurfaceClass`, `WindSurfaceRoughness`, `validateWindEffects` and 7 more.

### Changed

- Part of #2837
