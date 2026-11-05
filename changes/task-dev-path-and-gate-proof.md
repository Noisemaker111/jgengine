Breaking: the exports FRAXINUS_NIGRA, PRUNUS_SEROTINA and ROBINIA_PSEUDOACACIA and their plants/species/data subpaths are removed, because those species cannot yet grow a decurrent crown inside the forestry envelope; use another species from PLANT_LIBRARY

### Added

- `STAND_ENVELOPE` (`@jgengine/core/plants/species/speciesReference`): How far a stand-grown tree may sit from its tables and still pass, at 20, 50 and 100 years in {@link REFERENCE_STAND}: height within 15% of its Carmean or FIA curve, DBH within 25% of its FIA curve, crown width inside its Tallo band.

### Changed

- Breaking: the exports FRAXINUS_NIGRA, PRUNUS_SEROTINA and ROBINIA_PSEUDOACACIA and their plants/species/data subpaths are removed, because those species cannot yet grow a decurrent crown inside the forestry envelope; use another species from PLANT_LIBRARY

### Removed

- `@jgengine/core/plants/species/data/fraxinusNigra` no longer exports `FRAXINUS_NIGRA`.
- `@jgengine/core/plants/species/data/prunusSerotina` no longer exports `PRUNUS_SEROTINA`.
- `@jgengine/core/plants/species/data/robiniaPseudoacacia` no longer exports `ROBINIA_PSEUDOACACIA`.
