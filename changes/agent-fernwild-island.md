Fernwild's map is now ARK's The Island at 3/8 scale: its coastline and outer islands, the volcano and mountain chains at the wiki's heights, the five rivers, 72 biome outlines from snow to swamp, ARK's 231 creature spawn zones with each biome's species and weights, and resources where ARK puts them (metal on the mountains, obsidian at the volcano, crystal on the peaks, oil on the frozen shore). Herds wake near the survivor and sleep far away, so the whole island is populated without simulating it all. The engine gains surveyed terrain built from scene shapes, coastlines from outlines, polygon ground regions and a population director that leaves sleeping regions alone.

Engine seam: packages/core/src/terrain/surveyTerrain.ts (new), packages/core/src/terrain/terrain.ts (coast outlines, polygon material regions), packages/core/src/world/features.ts (TerrainCoast.outlines, TerrainPolygonRegion), packages/core/src/ai/populationDirector.ts (isActive, notifyRemoved delay)

Prevention: surveyTerrain tests (reading shores, summits, chains, rivers and biomes; plains height, crater dip, crest falloff; land inside and sea floor outside the outline; river channel to its bed; biome regions and lookup), terrain tests (outline land and sea with an islet, an L-shaped notch stays sea, refusal with neither radius nor outline, polygon region paint and blend), population director tests (a sleeping region keeps its slots queued until it wakes; a removal's own delay), headless Fernwild test (only herds near the survivor are awake, and carrying the survivor across the island sleeps the beach herds and wakes a raptor zone); loop proofs `bun run drive fernwild --flow fernwild-loop`, `--flow fernwild-tame`, `--flow fernwild-build`.

Bends: none.

### Added

- `surveyFromDocument`, `surveyTerrain`, `surveyHeightField`, `surveyBiomeAt`, `surveyIsLand` (`@jgengine/core/terrain/surveyTerrain`): build a real-world-style landmass from scene shapes — `coast` outlines, `peak` markers (height, radius, crater), `ridge` paths (crest heights, width), `river` paths (width, bed) and `biome` outlines (ground material and colours) — into terrain config.
- `TerrainCoast.outlines`: a coast shaped by one or more closed shore outlines (islands, bays, capes) instead of a single wobbled ellipse.
- `TerrainPolygonRegion`: paint terrain ground inside any polygon, blended over its falloff.
- `PopulationTickContext.isActive` and `notifyRemoved(..., { delay })`: a region can sleep with its slots kept until it wakes, and a game can refill a culled slot at once.

### Changed

- Coast signed distance uses a polyline index and a coarse land grid, so a detailed outline costs about the same per sample as the old ellipse.
