### Added

- `planInteriorDressing` and `interiorWallRuns` (`@jgengine/core/world/interiorDressing`) plan an interior's trims, pipe runs with brackets and valves, sagging cables, stains, wall lamps and wall clutter slots from its room footprints, deterministic per seed, with kept-clear spots and a walkway left open. `nearestFixtures` picks the lamps nearest an eye for a light pool.
- `InteriorDressing` and `PracticalLights` (`@jgengine/shell/render/InteriorDressing`) draw a plan in a handful of instanced draws (static shape batches, one merged cable mesh, one instanced decal mesh per stain style) and light the nearest lamps from a fixed, shadow-capped spot-light pool.
- Decal styles `grime`, `leak`, `rust` and `wet`.
- `postProcessing.atmosphere.indoor` keeps the haze running with no shadow-casting sun, and `atmosphere.lamps` makes the nearest point and spot lights (up to eight) glow in it. A light with `userData.haze === false` never glows.
