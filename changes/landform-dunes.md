createDuneField grows barchan, transverse, linear and star dunes from a wind regime and sand supply (Werner 1995 slab model): slip faces stand at the angle of repose and dunes migrate at a speed inversely proportional to height

### Added

- createDuneField grows barchan, transverse, linear and star dunes from a wind regime and sand supply (Werner 1995 slab model): slip faces stand at the angle of repose and dunes migrate at a speed inversely proportional to height
- `DEFAULT_DUNE_PARAMS` (`@jgengine/core/landform/dunes/duneField`): Werner's (1995) rules: one wind toward the east, hop 1, landing 0.6 on sand and 0.4 on bed, 15° shadow. Also `DuneField`, `DuneFieldOptions`, `DuneGrid`, `DuneInitial`, `DuneParams`, `DuneSnapshot`, `WindMode`, `createDuneField` and 1 more.

### Changed

- Part of #2742
