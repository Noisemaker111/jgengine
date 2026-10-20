### Added

- `GameContextObjectEntry.scenery` (`@jgengine/core`): an object kind placed once and left alone. Its runtime placements now render through the shared instanced static-object batches that editor-authored props already used.

### Changed

- Static-object batches group same-model props per 64 m cell from 3 placements (was 24 m cells and more than 8), so sparse city dressing such as palms, lamps and benches shares draws. Harbor Heat's opening drops from 5,310 to 4,650 draw calls.
