sugar maples grow a broad, rounded crown instead of a spire; apical control now falls with age (apicalControlMature, apicalControlHalfYears), while white pines keep enough of it to stay conical

Root cause: the Borchert-Honda apical control was one constant for life, so every tree kept its leader dominant; decurrent species such as sugar maple lose apical control as they mature and laterals overtake the leader

### Added

- an even-aged stand option on PlantEnvironment (stand.spacingIndex) that shades a plant by neighbours of its own height, for forest-grown form
- plants/validation/crownAllometry with the Ek 1974 and Bechtold 2003 crown-width equations, Tallo measured crown widths and a crown profile measure, tested at 20, 50 and 100 years open- and forest-grown for both species
- `EASTERN_WHITE_PINE_CROWN_WIDTH` (`@jgengine/core/plants/validation/crownAllometry`): FVS `cwcalc.f` species 129, eastern white pine. Also `CrownProfile`, `CrownWidthClass`, `CrownWidthEquations`, `SUGAR_MAPLE_CROWN_WIDTH`, `TALLO_CROWN_WIDTH`, `crownProfile`, `forestGrownCrownWidthM`, `measuredCrownWidthBandM` and 1 more.

### Changed

- sugar maple and white pine are refitted (species version 2) and the plant simulation version is 3, so cached plants regrow
- Open-grown crowns still run 1.2-1.7x Ek 1974 per DBH because simulated crowns hold too little leaf area; tracked in #2729
- Part of #2699

### Fixed

- sugar maples grow a broad, rounded crown instead of a spire; apical control now falls with age (apicalControlMature, apicalControlHalfYears), while white pines keep enough of it to stay conical

### Removed

- `@jgengine/core/nature/natureMesh` no longer exports `LeafClusterOptions`, `NatureMeshPart`, `addLeafCluster`.
- `@jgengine/core/nature/natureMesh.draw` no longer exports `natureDraws`.
