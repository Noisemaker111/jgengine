27 broadleaf and pine species keep their earlier growth numbers, which render fuller, rounder crowns than this branch's refit (black ash no longer dies back, walnut and elm spread); their stand-tree and crown-kind table checks are widened

### Added

- the plant library demo takes ?age= to show every species at another age
- `SideLight` (`@jgengine/core/plants/growth/lightField`): Sky light arriving from the side.
- `SIDE_LIGHT_SHARE` (`@jgengine/core/plants/growth/plantEnvironment`): Share of an overcast sky's light that reaches a randomly oriented leaf from more than 45° off the zenith: with sky radiance ∝ 1 + 2 cos θ (Moon & Spencer 1942, the CIE standard overcast sky) it is (cos 45° + cos² 45°) / 2 ≈ 0.6.
- `PlantGrowthOptions` (`@jgengine/core/plants/growth/plantGrowth`): How {@link createPlantGrowth} grows a plant beyond its species, site and seed.
- `CrownForm` (`@jgengine/core/plants/species/plantSpecies`): Where a tree's crown carries its spread (Brown, McAlpine & Kormanik 1967): a decurrent tree loses its leader and divides into a few large limbs, an excurrent one keeps one stem to the top.
- `PLANT_SHOOT_LEAF_SPAN` (`@jgengine/core/plants/structure/plantStructure`): Share of a shoot, from its tip back, its leaves hang along; the rest is bare.
- `CODOMINANT_RATIO` (`@jgengine/core/plants/validation/crownArchitecture`): A limb this share of the diameter of the stem it leaves, or more, is a codominant stem (Gilman 2011). Also `CROWN_ARCHITECTURE_AGE`, `CROWN_ARCHITECTURE_MEASURES`, `CROWN_ARCHITECTURE_MISSES_ALLOWED`, `CROWN_ARCHITECTURE_SEEDS`, `CrownArchitecture`, `CrownArchitectureOptions`, `CrownArchitectureTarget`, `CrownShapeBands` and 5 more.

### Changed

- 27 broadleaf and pine species keep their earlier growth numbers, which render fuller, rounder crowns than this branch's refit (black ash no longer dies back, walnut and elm spread); their stand-tree and crown-kind table checks are widened
- the sugar maple's forestry-table tests allow its look-tuned crown
- The open-grown width may run to 1.6x Ek 1974 (was 1.25x), the stand crown 10% past the Tallo band, the stand crown ratio to 0.75 (was 0.55), and open-grown 20-year foliage to 3x Jenkins 2003 (was 1.4x); the crown-kind guardrail no longer runs for it. Every other species keeps the strict checks. Shoots trimmed 4% so stand height stays within 15% of Carmean.
- Plant growth: side light, crown density check and refits (squashed for rebase)

### Fixed

- the sugar maple grows a broad, divided crown instead of a narrow cone (hand-tuned for looks: weaker leader with age, longer shoots, stronger side growth)
