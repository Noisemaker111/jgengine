Fernwild's map is now ARK's The Island at 3/8 scale: its coastline and outer islands, the volcano and mountain chains at the wiki's heights, the five rivers, 72 biome outlines from snow to swamp, ARK's 231 creature spawn zones with each biome's species and weights, and resources where ARK puts them (metal on the mountains, obsidian at the volcano, crystal on the peaks, oil on the frozen shore). Herds wake near the survivor and sleep far away, so the whole island is populated without simulating it all. The survivor wakes on the sand facing inland with a tree to punch. The engine gains surveyed terrain built from scene shapes, coastlines from outlines, polygon ground regions, a population director that leaves sleeping regions alone, a per-game scatter budget (a field over budget now thins evenly instead of dropping whatever came last), faster scatter resolution, and asset provisioning that follows aliases.

Engine seam: packages/core/src/terrain/surveyTerrain.ts (new), packages/core/src/terrain/terrain.ts (coast outlines, polygon material regions), packages/core/src/world/features.ts (TerrainCoast.outlines, TerrainPolygonRegion), packages/core/src/ai/populationDirector.ts (isActive, notifyRemoved delay), packages/core/src/scatter/ (capScatterInstances, faster resolve), packages/core/src/scene/AuthoredScene.draw.tsx + packages/shell/src/defineGame.tsx (scatterBudget / sceneScatterBudget), games/shared/provisionAssets.ts (aliases)

Prevention: surveyTerrain tests (reading shores, summits, chains, rivers and biomes; plains height, crater dip, crest falloff; land inside and sea floor outside the outline; river channel to its bed; biome regions and lookup), terrain tests (outline land and sea with an islet, an L-shaped notch stays sea, refusal with neither radius nor outline, polygon region paint and blend), scatter test (a field over budget thins evenly across the whole field), provisioning test (a pack named only through an asset alias is linked), population director tests (a sleeping region keeps its slots queued until it wakes; a removal's own delay), headless Fernwild test (only herds near the survivor are awake, and carrying the survivor across the island sleeps the beach herds and wakes a raptor zone); loop proofs `bun run drive fernwild --flow fernwild-loop`, `--flow fernwild-tame`, `--flow fernwild-build`.

Bends: none.

### Added

- `surveyFromDocument`, `surveyTerrain`, `surveyHeightField`, `surveyBiomeAt`, `surveyIsLand` (`@jgengine/core/terrain/surveyTerrain`): build a real-world-style landmass from scene shapes — `coast` outlines, `peak` markers (height, radius, crater), `ridge` paths (crest heights, width), `river` paths (width, bed) and `biome` outlines (ground material and colours) — into terrain config.
- `TerrainCoast.outlines`: a coast shaped by one or more closed shore outlines (islands, bays, capes) instead of a single wobbled ellipse.
- `TerrainPolygonRegion`: paint terrain ground inside any polygon, blended over its falloff.
- `PopulationTickContext.isActive` and `notifyRemoved(..., { delay })`: a region can sleep with its slots kept until it wakes, and a game can refill a culled slot at once.
- `sceneScatterBudget` (`defineGame`) and `AuthoredScene` `scatterBudget`: how many scatter instances a game's scene draws; default stays 20000.
- `capScatterInstances` (`@jgengine/core/scatter/InstancedScatter.draw`): thin a scatter list evenly to a budget.

### Changed

- A scatter field over its instance budget thins evenly across the map instead of dropping every instance past the budget in document order (whole regions used to vanish).
- Scatter resolution about twice as fast: no surface-normal sample unless slope or alignment needs it, numeric spacing buckets.
- Asset provisioning links a pack a game names only through an asset alias (Fernwild's survivor model was a missing-model cube).
- Coast signed distance uses a polyline index and a coarse land grid, so a detailed outline costs about the same per sample as the old ellipse.
