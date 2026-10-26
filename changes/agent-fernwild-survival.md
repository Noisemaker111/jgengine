Fernwild is remade on the current engine as ARK: Survival Evolved's survival loop, and the engine gains the survival, harvest and island systems it needed.

Engine seam: packages/core/src/survival/vitals.ts, packages/core/src/survival/bodyTemperature.ts, packages/core/src/harvest/scatterHarvest.ts, packages/core/src/scatter/scatterClearing.ts, packages/core/src/terrain/terrain.ts (withCoast), packages/core/src/scatter/InstancedScatter.draw.tsx (chunk budget, detail culling, stable chunks on clearing)

Prevention: vitals, body temperature, scatter harvest, coast, scatter chunk budget and stable-chunk tests in packages/core; a headless Fernwild test (punch, pick, craft a Stone Pick, level 2 with 8 engram points, dehydration costs ~1 HP per 5 s); loop proof `bun run drive fernwild --flow fernwild-loop` passes 14/14.

Bends: none.

### Migrate

- `resolveScatter` returns `readonly ScatterInstance[]` (results are shared through a per-document cache). Copy before mutating.

### Added

- `createVitals` (`@jgengine/core/survival/vitals`): named survival pools with drain, delayed regen that can cost another pool, empty-pool links (starvation hurts health, raises torpor) and hysteresis flags; snapshot/restore.
- `ambientTemperature` and `bodyComfort` (`@jgengine/core/survival/bodyTemperature`): air temperature from climate, time of day, weather, altitude, wetness and heat sources; hypothermia/hyperthermia as drain multipliers and exposure damage, with insulation and fortitude.
- `createScatterHarvest` (`@jgengine/core/harvest/scatterHarvest`): any scatter placement becomes a gatherable node (tool bias, budgets, respawn) found by a cone strike; spent nodes disappear from the drawn scatter and regrow.
- `createScatterClearing` / `scatterClearingOf` (`@jgengine/core/scatter/scatterClearing`) and `InstancedScatter`'s `hidden` prop: hide felled or mined placements; `AuthoredScene` reads it.
- `ResourceNodeConfig.resolve`: nodes created lazily on first touch, so an island of trees costs nothing until one is hit.
- `terrain({ coast })` / `withCoast`: shape any terrain into an island with a beach shelf and sea floor.
- `InstancedScatter` `maxChunks` (default 400): big fields grow their chunks instead of splitting into tens of thousands of scene objects.

### Fixed

- An island-sized scatter field ran at ~9 fps: every 24 m chunk was a scene object per species and draw source, small detail drew at any distance, and the impostor split searched batches quadratically. Chunks are now budgeted, sub-impostor species cull past a size-scaled distance, and only chunks whose placements crossed a switch distance re-upload (59 fps on Fernwild's island).
- Clearing one placement rebuilt every scatter mesh; untouched chunks now keep their meshes.
