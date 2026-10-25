One module per world system: grass, roads, building placement, sky, culling and the reflection probe each exist once, with knobs and a quality floor, and every game runs on them.

Engine seam: `@jgengine/core/world` (grassKind, features `road()`, pathRoads, buildingLots, environmentSummary) and `@jgengine/shell` (terrain/GrassField, environment/RoadRibbons `Roads`, environment/Daylight `Sky`, visibility/cullingDriver + renderBounds, render/worldReflectionProbe).

- Grass: one `GrassField` renderer and one `grass()` rule set (species, colours, height, density, wind, clumping, accents). Density is floored at `GRASS_MIN_DENSITY` (40 blades/m²) under a 3M-blade budget with near/far LOD, so sparse tufts cannot be authored. Fixed a stale instance count that left fields empty after a prop change.
- Roads: one `Roads` drawer for streets, tracks and trails, from `road()` or a scene path (`pathRoad`). Paved roads wear the scanned `asphalt/dry` by default; width, sidewalks, kerbs, markings, rounded corners, closed loops and soft dirt edges are knobs. Apex Nights' duplicate ribbon under its track is gone; `games:provision` pulls the asphalt scan for any game that draws a paved road.
- Buildings: `building()` always places through the frontage placer, which now knows sidewalks (setback is measured from the back of the sidewalk) and keeps lots off every other street; a settlement a street runs through now lines that street instead of standing on it (Scrap Signal keeps all 40 buildings). Deleted the unused `createBuildingGrid` / `generateBuildingDistrict`.
- Sky: one `<Sky>` component (static, clock-driven, banded, authored modulation). Deleted `Daylight`, `SkyDaylight`, `StaticSkyDaylight`, `TimeOfDayDaylight`, `BiomeDaylight`, `DrivenDaylight`, `AuthoredDaylight`, `DayNightSky`.
- Culling: entities and props cull on the bounds their model actually mounted (a yaw-safe sphere), not a fixed 2 m / scale guess, so a long or tall model vanishes only once it is fully off-screen.
- Reflection probe: a capture waits for model streaming to settle and is dropped if streaming starts mid-capture, so reflections stop flickering while the world loads.

Before / after (grass: Fernwild, Scrap Signal; roads: Apex Nights, Harbor Heat):

![fernwild-before](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/world-unify/fernwild-before.png)
![fernwild-after](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/world-unify/fernwild-after.png)
![scrap-signal-before](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/world-unify/scrap-signal-before.png)
![scrap-signal-after](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/world-unify/scrap-signal-after.png)
![apex-nights-before](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/world-unify/apex-nights-before.png)
![apex-nights-after](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/world-unify/apex-nights-after.png)
![harbor-heat-before](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/world-unify/harbor-heat-before.png)
![harbor-heat-after](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/world-unify/harbor-heat-after.png)

Perf: Ember Command's triangle ceiling rises to 742,000 from three measured runs (674,722 / 674,734 / 674,734): the floored meadow is ~475k of it. Its linkProgram 4-5 and nodes 1,078 overages reproduce on unmodified origin/beta. Beacon Bastion, Brightway Park and Scrap Signal pass unchanged. All 17 runnable games and the touched demos boot clean (`bun run smoke` + a `shoot` per game).

Regression tests: grassKind density floor, GrassField LOD/blade count, pathRoads, drawnRoadPath (closed loops, no zero-length fillets), roads default scan, buildingLots sidewalks and lane mode, cullingDriver measured bounds, worldReflectionProbe streaming gate.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

### Migrate

- `grass({ density, colors })` is now `grass({ density, colorBase, colorTip, ... })`; density below 40 blades/m² is raised to the floor. `GrassField` takes `rules` (from `readGrassRules`).
- `Daylight`, `SkyDaylight`, `StaticSkyDaylight`, `TimeOfDayDaylight`, `BiomeDaylight`, `DrivenDaylight`, `AuthoredDaylight` and `DayNightSky` are removed: render `<Sky sky={...} clock={...} />` (`@jgengine/shell/environment`).
- `createBuildingGrid` and `generateBuildingDistrict` are removed: use `building({ count, position })` with `resolveStructureBuildings`, which places through the frontage placer.
- A `building({ along })` road's `setback` is now measured from the back of its sidewalk; pass `sidewalk` on the road (a `road()` descriptor fits as-is).

### Added

- `Roads` (`@jgengine/shell/environment/RoadRibbons`) draws every road, track and trail; `pathRoad` (`@jgengine/core/world/pathRoads`) turns a scene path into one. `road()` gains `closed`, `cornerRadius`, `wear` and `edgeSoftness`; `DEFAULT_ROAD_SCAN` is the default paved surface.
- `GRASS_MIN_DENSITY`, grass `clumping`, `clumpSize`, `accentShare`, `accentHeight`, `accentColor`, `heightVariation`.

### Fixed

- Models no longer disappear while part of them is still on screen: culling uses measured model bounds.
- World reflections no longer flicker while models stream in.
- Apex Nights no longer draws a second road ribbon under its track.
