white clover, dandelion, oxeye daisy and springy turf-moss grow in the tiller field next to the grasses (GROUND_COVER_LIBRARY).

### Migrate

- GrassSpecies is now GroundCoverSpecies in plants/groundCover/groundCoverSpecies; each record needs habit and seedEstablishment.

### Added

- white clover, dandelion, oxeye daisy and springy turf-moss grow in the tiller field next to the grasses (GROUND_COVER_LIBRARY).
- GroundCoverSpecies.habit: grass tillers die when they seed, herb rosettes live on, and moss fills the ground the sward leaves bare, so it takes shaded lawns.
- tillerCellLook draws herb flowers over grass heads and sizes blades from the species holding the most ground.
- `GRASS_LIBRARY` (`@jgengine/core/plants/groundCover/groundCoverSpecies`): The grasses shipped with the engine. Also `GROUND_COVER_LIBRARY`, `GroundCoverSpecies`, `LEUCANTHEMUM_VULGARE`, `LOLIUM_PERENNE`, `PHLEUM_PRATENSE`, `POA_PRATENSIS`, `RHYTIDIADELPHUS_SQUARROSUS`, `TARAXACUM_OFFICINALE` and 1 more.

### Changed

- Part of #2699

### Fixed

- a mown lawn no longer reads as gone to seed.
- rhizomes and stolons no longer root past a cell's shade limit.

### Removed

- `@jgengine/core/plants/groundCover/grassSpecies` no longer exports `GRASS_LIBRARY`, `GrassSpecies`, `LOLIUM_PERENNE`, `PHLEUM_PRATENSE`, `POA_PRATENSIS`.
