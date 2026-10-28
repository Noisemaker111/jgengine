shrubs grow as clumps whose stems die and resprout from the roots (growth.stemLifespanYears), so a bush keeps its size for decades

Engine seam: packages/core/src/nature/natureGenerators.ts, packages/core/src/nature/natureMesh.draw.ts, packages/core/src/nature/natureMesh.ts, packages/core/src/plants/cache/plantCodec.ts, packages/core/src/plants/growth/plantGrowth.ts, packages/core/src/plants/mesh/plantMesh.ts, packages/core/src/plants/species/data/plantLibrary.ts, packages/core/src/plants/species/data/vacciniumCorymbosum.ts and 6 more

### Migrate

- replace nature.bush scatter items with plant.grown and a shrub species

### Added

- shrubs grow as clumps whose stems die and resprout from the roots (growth.stemLifespanYears), so a bush keeps its size for decades
- highbush blueberry, the first shrub, fitted to USDA PLANTS heights (3.66 m at 20 years) and checked by the library test
- flowers and fruit draw as small coloured clusters (reproduction.fruitColor)
- plants import, fit, write and report handle shrubs, palms, ferns and herbs through USDA PLANTS (habitSpecies.ts, habitReferenceTable.ts)
- `VACCINIUM_CORYMBOSUM` (`@jgengine/core/plants/species/data/vacciniumCorymbosum`): Highbush blueberry.
- `HABIT_CHECK_AGES` (`@jgengine/core/plants/species/habitReference`): Ages a habit species is grown to and checked at. Also `HabitReference`, `SHRUB_STEMS`, `basalStemCount`.
- `HABIT_REFERENCE` (`@jgengine/core/plants/species/habitReferenceTable`): USDA PLANTS heights and growth form of every shrub, palm, fern and herb in the library.

### Changed

- Part of #2699

### Removed

- the nature.bush generator and addLeafCluster; Fernwild's bushes are grown blueberries
- `@jgengine/core/nature/natureGenerators` no longer exports `BUSH_GENERATOR`, `BUSH_SCHEMA`.
- `@jgengine/core/nature/natureMesh` no longer exports `LeafClusterOptions`, `addLeafCluster`.
- `@jgengine/core/world` no longer exports `BUSH_GENERATOR`, `BUSH_SCHEMA`.
