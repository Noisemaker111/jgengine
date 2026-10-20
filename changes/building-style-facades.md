### Added

- `BUILDING_STYLE_PROBABILITIES` and `resolveBuildingProbabilities` (`@jgengine/core/world/buildings`): each `BuildingStyle` now carries facade-part probabilities, so an industrial yard shows few windows and roof plant, a ruin loses awnings and clotheslines, coastal fronts gain awnings. `building({ probabilities })` overrides any part.

### Changed

- `building()` districts with a non-generic `style` generate a different facade mix than before (previously a style changed colours only). `generic` is unchanged.
