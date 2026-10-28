createStand, a forest plot of competing trees stepped a year at a time: each tree a stem and crown advancing along its species' reference curves by the light it gets through taller crowns, with suppression and age mortality, seed rain into a seedling bank and recruits at breast height.

### Added

- createStand, a forest plot of competing trees stepped a year at a time: each tree a stem and crown advancing along its species' reference curves by the light it gets through taller crowns, with suppression and age mortality, seed rain into a seedling bank and recruits at breast height.
- standTreeGrowth, the createPlantGrowth inputs that grow one stand tree at full detail from its own seed, lifetime light and spacing.
- the forest-stand dev demo, a cleared hectare at 30, 100 and 200 years.
- `createStand` (`@jgengine/core/plants/stand/standSim`): Create a forest plot. Also `Stand`, `StandOptions`, `StandPlanting`, `StandSnapshot`, `StandStats`, `StandTree`, `StandTreeGrowth`, `StandTreeState` and 1 more.

### Changed

- Tested: a dense red pine plantation self-thins with slope about -1.7 (Reineke -1.6), a cleared plot seeded by maple, birch and aspen turns maple-dominated by year 200, and a hectare runs 300 years in about 3 s.
- Not yet: the bake verb, and full-detail trees shaped by their neighbours' crowns over time rather than by mean light and spacing.
- Part of #2699

### Removed

- `@jgengine/core/movement/reference/flightPower` no longer exports `FLAPPING_MASS_LIMIT`, `FlierBody`, `FlierComparison`, `FlightPower`, `INDUCED_POWER_FACTOR`, `INSECT_WINGBEATS`, `ORNITHODOLITE_AIRSPEEDS`, `PUBLISHED_FLIERS` and 8 more.
