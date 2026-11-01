# Recipe — environment (one wind, forests, ground cover, soft soil, landform start)

**What this wires:** the physical environment from the repo's reference models into a running game. Each physical effect is its own named term with a `strength`: `0` off, `1` what the reference measures, past `1` more, finite and monotone over `0..4`. Leave an effect out and today's behaviour stays.

## One wind

- **Field.** `windField({ direction, speed, seed, effects: { surface: "grass", profile: {}, gusts: {} } })` from `@jgengine/core/world/wind`. `speed` is the mean at 10 m. `surface` is `openWater | grass | forest | city` (EN 1991-1-4 terrain categories).
  - `profile`: log-law speed over height, `strength` is an exponent on ln(z/z₀)/ln(10/z₀).
  - `gusts`: along-wind gusts from the Eurocode Annex B spectrum, σ = strength · I_v · U, carried downwind.
  - Sample with `atHeight(x, z, heightM, t)`; `atPoint`, `at` and `strengthAt` read the 10 m wind as before.
  - Ground truth: `bun scripts/reference/environment/windComparison.ts` prints the field against the reference (mean, σ, 10 s variance share).
- **Authored.** A scene's `simulation.weather.wind` takes the same config, `effects` included; authored weather, rain and grass fields read it.
- **Grass.** `<GrassPatch wind={{ field, response }} />`; `response` `0` still, `1` the kind's own sway at a 5 m/s breeze. Authored `grass_field` and `ground_cover` volumes read the document's weather wind themselves.
- **Rain, snow, dust, trees.** `<WeatherLayer windField={field} />`; precipitation drifts with the wind at 10 m over the camera and foliage sways with it, even in clear weather.
- **Boats.** `createBoatDynamics(tuning, { wind: { field, strength } })`; windage drags the above-water areas toward the wind.

## Forests and ground cover (editor scene kinds)

- **Forest stand.** Draw a `forest_stand` path (Studios → Forest stand). Its species mix, `plantedPerHa`, `ageYears`, `seed` and `selfThinning` dial grow one plot with the stand model, tiled over the polygon. Trees join the document's scatter with `item` = species id, so map species to models in `scatterModels` and set `modelHeightM` to the model's authored height.
- **Ground cover.** Place a `ground_cover` volume. Its sown species, weeks, mowing height, trampling, grazing and light are grown by the tiller model into the grass look it renders with.
- Both are deterministic per document: the same scene loads to the same trees and the same sward.

## Soft soil

- `createSoftGround(editableTerrain, { soil: softSurfaceSoil(editableTerrain, { sand: { material: DRY_SAND, looseDepthM: 0.4 } }), sinkage, recovery })` from `@jgengine/core/granular/softGround`. Painted surfaces listed are that soil; everything else stays hard.
- Cars: `tickDrivableVehicle(car, dt, axis, { tires: { id, time, soil: { ground } } })` ruts under each wheel's static load; the car sim is unchanged.
- Feet: `ground.foot(x, z, radius, loadN)`. Step `ground.step(dt)` each tick so rut walls slump to the material's repose angle.
- `sinkage` scales the load the soil carries; `recovery` scales slumping time.

## Landform start

- `bun run jgengine create "<Name>" --landform glacial-valley|dunes|coast` writes `terrainGenerator: { kind: "landform", start, seed: <game id> }` into the scene, and `editorLayers.ts` grows it with `withGeneratedTerrain` (`@jgengine/core/terrain/landformStart`) on first load.
- The editor's first save keeps the grown terrain as the scene's sculpt; reshape it like any other. Without the flag a game starts on the starter hills (or flat with `--ground flat`).
- Gaps: the coast has no water volume yet, and the glacial valley takes about 4 s to grow on first load.
