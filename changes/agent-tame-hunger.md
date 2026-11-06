every tame has a food meter; it eats what its diet takes from its own inventory and starves to death without (creatures.feed-starve)

Engine seam: packages/core/src/stats/doseTable.ts

### Added

- every tame has a food meter; it eats what its diet takes from its own inventory and starves to death without (creatures.feed-starve)
- eatWhileRoom and DoseSupply in stats/doseTable, the shared 'eat from what you hold while there is room' step
- `eatWhileRoom` (`@jgengine/core/stats/doseTable`): Eat from `supply` while there is room: each time, the receiver's most preferred source it holds whose gain to `vital` fits under the max is taken and its doses go into `body`. Also `DoseSupply`.

### Changed

- a baby's hunger is the same meter at a faster pace; the breeding card no longer carries food
