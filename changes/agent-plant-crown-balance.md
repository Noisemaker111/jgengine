open-grown sugar maple and white pine crowns now match Ek 1974 widths (0.8–1.25×) at 20, 50 and 100 years, and stand-grown crowns sit inside the Tallo band

Root cause: crowns held too little leaf area for their spread, so the fit traded width for height, and stand neighbours could not stop a crown spreading into their space

Closes #2729

### Added

- carbon.lightHalfSaturation, a saturating light response (Thornley 1976), so a shaded crown keeps its leaves and an open one stops overbuilding
- growth.establishmentYears and the sapwoodAtBreastHeightM2 stat
- stand neighbours are periodic images in the light field, and space nearer a neighbour's stem gets no light (crown shyness, Putz et al. 1984)
- `matrixEigenvalues` (`@jgengine/core/flight/reference/aircraftTrim`): Eigenvalues of a small real matrix: Faddeev–LeVerrier characteristic polynomial, then Durand–Kerner roots. Also `Eigenvalue`, `solveLinearSystem`.
- `BAAD_LEAF_TO_SAPWOOD` (`@jgengine/core/plants/validation/stemAllometry`): Leaf area per sapwood area at breast height of temperate and boreal trees taller than 5 m in the Biomass And Allometry Database (Falster et al. Also `FIA_STAND_DIAMETER`, `LeafToSapwoodBand`, `StandDiameterAtAge`.

### Changed

- Part of #2699

### Fixed

- open-grown sugar maple and white pine crowns now match Ek 1974 widths (0.8–1.25×) at 20, 50 and 100 years, and stand-grown crowns sit inside the Tallo band
- forest-grown trees reach FIA site-tree diameters on site index 65, and open-grown trees carry the BAAD leaf area per sapwood area
- evergreen foliage is renewed only after leaf.lifespanYears, and laterals the bud cap refuses grow as short shoots

### Removed

- `@jgengine/core/flight/reference/rocket` no longer exports `EarthModel`, `GravityTurnProgram`, `Rocket`, `RocketAero`, `RocketControl`, `RocketDesign`, `RocketEngine`, `RocketLaunch` and 12 more.
- `@jgengine/core/flight/reference/rocketComparison` no longer exports `compareRocketAscent`, `saturnVGameTuning`.
- `@jgengine/core/flight/reference/saturnV` no longer exports `F1_ENGINE`, `SATURN_V_AS506`, `SATURN_V_AS506_ASCENT`, `SATURN_V_AS506_EVENTS`, `SATURN_V_AS506_LAUNCH`.
- `@jgengine/core/math/linearAlgebra` no longer exports `Eigenvalue`, `matrixEigenvalues`, `solveLinearSystem`.
- `@jgengine/core/physics/reference/compareHandling` no longer exports `BikeHandlingComparison`, `MOTORCYCLE_PUBLISHED_TOLERANCES`, `MotorcyclePublishedCheck`, `checkReferenceMotorcycle`, `compareBikeMetrics`, `compareBikeTuning`, `measureReferenceMotorcycle`, `validateReferenceMotorcycles`.
- `@jgengine/core/physics/reference/eigenvalues` no longer exports `polynomialRoots`.
- `@jgengine/core/physics/reference/motorcycleManeuvers` no longer exports `BikeCourseSubject`, `BikeHandlingMetrics`, `BikeHandlingOptions`, `BikeScenario`, `measureBikeHandling`.
- `@jgengine/core/physics/reference/motorcycleRider` no longer exports `MotorcycleRiderOptions`, `RiddenMotorcycle`, `RiddenMotorcycleState`, `createRiddenMotorcycle`.
- `@jgengine/core/physics/reference/motorcycleTire` no longer exports `MotorcycleTireCoefficients`, `MotorcycleTireInput`, `MotorcycleTireOutput`, `SPORT_FRONT_120_70_ZR17`, `SPORT_REAR_180_55_ZR17`, `motorcycleMagicFormula`.
- `@jgengine/core/physics/reference/realMotorcycles` no longer exports `GSXR1000_SHARP_2004`, `PublishedMotorcyclePerformance`, `REAL_MOTORCYCLES`, `RealMotorcycle`.
- `@jgengine/core/physics/reference/referenceMotorcycle` no longer exports `MotorcycleBody`, `MotorcycleControls`, `MotorcycleModes`, `MotorcyclePowertrain`, `MotorcycleRearLinkage`, `MotorcycleWheel`, `ReferenceMotorcycle`, `ReferenceMotorcycleOptions` and 6 more.
- `@jgengine/core/physics/reference/rigidBodyTree` no longer exports `RigidBodyDefinition`, `RigidBodyTree`, `RigidBodyTreeState`, `RigidJoint`, `createRigidBodyTree`.
- `@jgengine/core/physics/reference/rungeKutta` no longer exports `RungeKutta4`, `createRungeKutta4`.
- `@jgengine/core/physics/reference/whippleBicycle` no longer exports `BENCHMARK_BICYCLE`, `BENCHMARK_BICYCLE_EIGENVALUES`, `WhippleBicycle`, `WhippleBicycleInput`, `WhippleBicycleParameters`, `WhippleBicycleSnapshot`, `WhippleBicycleStart`, `WhippleBicycleState` and 7 more.
