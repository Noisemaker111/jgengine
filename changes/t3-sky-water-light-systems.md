the sky publishes one light record each frame (sun, moon, ambient, sky colours, cloud cover), via publishSkyLight and readSkyLight. Water and clouds read it, so a game's own sky can replace the engine's.

Root cause: the ocean was unlit and shaded depth per vertex on a 41 m grid, so its edge was hard. Night fog used the authored day colour at every hour.

Closes #2684

Engine seam: packages/core/src/environment/EnvironmentScene.draw.tsx, packages/core/src/sky/Daylight.draw.tsx, packages/core/src/sky/VolumetricClouds.draw.tsx, packages/core/src/sky/daylightCycle.ts, packages/core/src/sky/skyLight.draw.ts, packages/core/src/sky/skySun.draw.ts, packages/core/src/sky/volumetricClouds.ts, packages/core/src/water/Ocean.draw.tsx and 9 more

### Migrate

- Ocean's depthAt prop is now bedAt (ground height). syncOceanMaterial takes the SkyLight as its 4th argument. @jgengine/core/sky/skySun.draw is now skyLight.draw. bandFogColor takes { timeOfDay, cycle, band }.

### Added

- the sky publishes one light record each frame (sun, moon, ambient, sky colours, cloud cover), via publishSkyLight and readSkyLight. Water and clouds read it, so a game's own sky can replace the engine's.
- weather conditions take cloudCover (0..1). It blends like the other conditions, and rain or storm raise it. The editor's simulation inspector edits it.
- raymarched clouds lit by the sun by day and the moon by night. They thicken and grey with cloud cover, and far cloud fades into the horizon.
- the ocean bakes the ground under it into a bed map. Clear shallows, depth colour, shore foam, swash and rolling foam lines follow the real shoreline. It reflects the sky, takes sun and moon light and fog, and with horizon: true it follows the camera out to the horizon.
- ocean() takes horizon, clarity and bedResolution. Fernwild uses them, with an overcast weather state, blue sky and clouds.
- `createSkyLight` (`@jgengine/core/sky/skyLight.draw`): A sky light at noon under a clear sky, for a scene whose sky has not published one yet. Also `SkyDirection`, `SkyLight`, `publishSkyLight`, `readSkyLight`.
- `CLOUD_NOISE_SIZE` (`@jgengine/core/sky/volumetricClouds`): Edge length of the tileable cloud noise volume, in voxels.
- `OceanBedBounds` (`@jgengine/core/water/oceanBed`): A rect in an ocean sheet's local XZ: `[minX, minZ, maxX, maxZ]`.

### Changed

- Sun shafts and height haze were already in the atmosphere post stage. The sea now writes depth so shafts no longer treat it as open sky.
- Perf (fernwild, walk, 8 s, RTX 3070, machine at 85% CPU load from other work; best of 6 alternating runs): beta p50 17.4 ms / GPU 11.9 ms, this branch p50 17.6 ms / GPU 11.7 ms. Run-to-run spread under that load was about 30%.
- Before (beta), at noon, overcast, rain, storm, dawn, dusk, night and the shore: ![before](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/t3/sky-water-light-systems/sky-before-sheet.png)
- After: ![after](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/t3/sky-water-light-systems/sky-after-sheet.png)
- Shore before / after: ![shore-before](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/t3/sky-water-light-systems/shore-before.png) ![shore-after](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/t3/sky-water-light-systems/shore-after.png)
- Waves, then overcast into rain (the clock runs 12x in the middle): ![clip](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/t3/sky-water-light-systems/fernwild-weather.gif)

### Fixed

- the night sky stayed dusk-orange. Night now holds between the twilights, and the day cycle owns fog colour, so night has no bright horizon band.

### Removed

- `@jgengine/core/sky/skySun.draw` no longer exports `SkySunDirection`.
