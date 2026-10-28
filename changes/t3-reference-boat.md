Reference hull hydrostatics in physics/reference: water pressure integrated over a hull mesh cut at the surface gives floating attitude, KB, BM, GM and the GZ curve with free trim. Checked against the Wigley hull's closed forms and the exact box-barge GZ to 90°.

### Added

- Reference hull hydrostatics in physics/reference: water pressure integrated over a hull mesh cut at the surface gives floating attitude, KB, BM, GM and the GZ curve with free trim. Checked against the Wigley hull's closed forms and the exact box-barge GZ to 90°.
- Holtrop–Mennen resistance and propulsion factors. They reproduce the 1982 worked example's coefficients and its 1793 kN total within 0.1%.
- Wageningen B-series propeller with the ITTC-1978 scale correction, and a waterjet by momentum theory.
- Savitsky planing hull: running trim, resistance and porpoising limit. Resistance is within 12% of the NACA TN 2876 tank runs.
- bun run perf boat [game] prints game boat vs reference hull vs published figures, metric by metric.
- `compareBoat` (`@jgengine/core/physics/reference/boatComparison`): Runs a game boat tuning and its reference hull through the same straight-line tests (calm-water resistance at set speeds, top speed and time to 90% of it on the game's own thrust law, coast-down distance to a quarter of top speed, and running trim for planing hulls) and lines them up beside published figures. Also `BoatComparisonSubject`, `ReferenceBoat`, `holtropExampleSubject`, `referenceBoatSubjects`, `referenceSubjectFor`, `speedboatSubject`, `surgeAddedMass`.
- `boxBarge` (`@jgengine/core/physics/reference/hullForm`): A rectangular box barge `length × beam × depth`: the textbook hull whose large-angle righting arm has a closed form. Also `HullMesh`, `HullOffsets`, `PrismaticPlaningHullOptions`, `WigleyHullOptions`, `hullMeshFromOffsets`, `meshVolume`, `prismaticPlaningHull`, `wigleyHull`.
- `MARINE_GRAVITY` (`@jgengine/core/physics/reference/hullHydrostatics`): Standard gravity, m/s². Also `FloatingAttitude`, `FloatingCondition`, `HullIntegrator`, `HullLoads`, `HullWater`, `HydrostaticParticulars`, `RightingArmPoint`, `SEA_WATER_DENSITY` and 9 more.
- `bSeriesBladeSection` (`@jgengine/core/physics/reference/marinePropeller`): Holtrop and Mennen's (1982) estimate of the 0.75R chord and thickness ratio from diameter, blades and area ratio. Also `BSeriesPropeller`, `OpenWaterPoint`, `PropellerOperatingPoint`, `ScrewBladeSection`, `Waterjet`, `WaterjetPoint`, `bSeriesOpenWater`, `bSeriesShipOpenWater` and 4 more.
- `NACA_TN2876_MODEL` (`@jgengine/core/physics/reference/planingHull`): Model 276's beam, m, and its tank water. Also `NACA_TN2876_RUNS`, `PlaningEquilibrium`, `PlaningFluid`, `PlaningHull`, `PlaningState`, `PrismaticPlaningRun`, `planingAtTrim`, `planingEquilibrium` and 3 more.
- `HOLTROP_MENNEN_EXAMPLE` (`@jgengine/core/physics/reference/shipResistance`): The hypothetical single-screw ship of Holtrop and Mennen's 1982 numerical example, with the results the paper prints for 25 knots, so the method is checked against its own authors' arithmetic. Also `HoltropConditions`, `HoltropHull`, `HoltropPropeller`, `HoltropPropulsionFactors`, `HoltropResistance`, `SEA_WATER_VISCOSITY`, `holtropMennenResistance`, `holtropPropulsionFactors` and 2 more.

### Changed

- Part of #2698

### Removed

- `@jgengine/core/plants/validation/stemAllometry` no longer exports `BAAD_LEAF_TO_SAPWOOD`, `FIA_STAND_DIAMETER`, `LeafToSapwoodBand`, `StandDiameterAtAge`.
