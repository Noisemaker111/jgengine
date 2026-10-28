grass grows as a tiller field: `createTillerField` with mow, trample, graze and shade, read into `GrassLook` by `tillerCellLook`

### Added

- grass grows as a tiller field: `createTillerField` with mow, trample, graze and shade, read into `GrassLook` by `tillerCellLook`
- ryegrass, timothy and Kentucky bluegrass records in `GRASS_LIBRARY`
- grass-field dev demo (lawn, meadow, worn path, shaded floor from one sim)
- `GRASS_LIBRARY` (`@jgengine/core/plants/groundCover/grassSpecies`): Every grass record shipped with the engine. Also `GrassSpecies`, `LOLIUM_PERENNE`, `PHLEUM_PRATENSE`, `POA_PRATENSIS`.
- `createTillerField` (`@jgengine/core/plants/groundCover/tillerSim`): Create a grass field of tiller cohorts, sown on 1 January with every species' tillers at a short, half-full sward. Also `CellArea`, `TillerCell`, `TillerCohort`, `TillerField`, `TillerFieldOptions`, `TillerFieldSnapshot`, `tillerCellLook`.

### Changed

- Part of #2699
