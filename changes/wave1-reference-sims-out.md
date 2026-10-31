the physics and flight reference sims from the runtime package; they live in scripts/reference and only scripts import them

### Changed

- Part of #2837

### Removed

- the physics and flight reference sims from the runtime package; they live in scripts/reference and only scripts import them
- `@jgengine/core/flight/reference/aircraftTrim` no longer exports `FlightLinearization`, `FlightMode`, `TrimCondition`, `TrimResult`, `WindAxisState`, `linearizeReferenceAircraft`, `referenceStateFromWindAxes`, `steadyAirData` and 3 more.
- `@jgengine/core/flight/reference/bo105Helicopter` no longer exports `BO105_DESIGN`, `BO105_FORWARD_FLIGHT_DATA`, `BO105_HOVER_DATA`, `BO105_MAIN_ROTOR`, `BO105_TAIL_ROTOR`, `BO105_TUNNEL_AIR`, `createBo105Model`.
- `@jgengine/core/flight/reference/cessna172Aircraft` no longer exports `C172_PROPELLER`, `createCessna172Model`.
- `@jgengine/core/flight/reference/coefficientTable` no longer exports `CoefficientTable`, `CoefficientTableAxis`, `createCoefficientTable`, `evenBreakpoints`.
- `@jgengine/core/flight/reference/f16Aircraft` no longer exports `F16ModelOptions`, `STEVENS_LEWIS_GRAVITY`, `createF16Model`, `f16CycleEngine`, `f16PowerCommand`, `f16Thrust`, `stevensLewisAtmosphere`.
- `@jgengine/core/flight/reference/flightComparison` no longer exports `CESSNA_172N_PUBLISHED`, `ComparisonTable`, `FlightComparison`, `FlightComparisonAircraft`, `FlightComparisonRow`, `PublishedFlightFigures`, `compareFlight`, `formatFlightComparison`.
- `@jgengine/core/flight/reference/flightTests` no longer exports `FlightTestControls`, `FlightTestOptions`, `FlightTestReport`, `FlightTestSample`, `FlightTestSubject`, `KNOTS_PER_MPS`, `referenceFlightSubject`, `rigidAircraftFlightSubject` and 1 more.
- `@jgengine/core/flight/reference/gasTurbine` no longer exports `GasModel`, `GasStream`, `GasTurbineComponents`, `GasTurbineCycle`, `GasTurbineDesign`, `GasTurbineFlight`, `GasTurbinePoint`, `InletKind` and 4 more.
- `@jgengine/core/flight/reference/gasTurbineEngine` no longer exports `GasTurbineCommand`, `GasTurbineEngine`, `GasTurbineEngineOptions`, `GasTurbineEngineOutput`, `createGasTurbineEngine`, `gasTurbinePropulsion`.
- `@jgengine/core/flight/reference/helicopter` no longer exports `HelicopterDesign`, `HelicopterModel`, `HelicopterModelOptions`, `HelicopterRotorTelemetry`, `HelicopterSurface`, `HelicopterTrim`, `HelicopterTrimCondition`, `createHelicopterModel` and 1 more.
- `@jgengine/core/flight/reference/helicopterRotor` no longer exports `IsolatedRotorCondition`, `IsolatedRotorTrim`, `RotorDesign`, `RotorFlow`, `RotorLoads`, `RotorPitch`, `createRotorLoads`, `evaluateRotor` and 6 more.
- `@jgengine/core/flight/reference/jetEngineComparison` no longer exports `JetComparison`, `JetComparisonAircraft`, `JetComparisonRow`, `compareJetEngines`.
- `@jgengine/core/flight/reference/propeller` no longer exports `BladeSection`, `PropellerGeometry`, `PropellerMap`, `clarkYPropellerSection`, `createPropellerMap`, `solvePropeller`.
- `@jgengine/core/flight/reference/referenceAircraft` no longer exports `ReferenceActuator`, `ReferenceAeroCoefficients`, `ReferenceAirData`, `ReferenceAircraft`, `ReferenceAircraftModel`, `ReferenceAircraftOptions`, `ReferenceAircraftSample`, `ReferenceAircraftState` and 12 more.
- `@jgengine/core/flight/reference/referenceEngines` no longer exports `F100_PW_220`, `F100_PW_220_DYNAMICS`, `F100_PW_220_PUBLISHED`, `MATTINGLY_LEVEL_3`, `MATTINGLY_LEVEL_4`, `V2500_A1`, `V2500_A1_PUBLISHED`.
- `@jgengine/core/flight/reference/rocket` no longer exports `EarthModel`, `GravityTurnProgram`, `Rocket`, `RocketAero`, `RocketControl`, `RocketDesign`, `RocketEngine`, `RocketLaunch` and 12 more.
- `@jgengine/core/flight/reference/rocketComparison` no longer exports `compareRocketAscent`, `saturnVGameTuning`.
- `@jgengine/core/flight/reference/rotorcraftComparison` no longer exports `RotorcraftComparison`, `RotorcraftComparisonAircraft`, `RotorcraftComparisonRow`, `compareRotorcraft`.
- `@jgengine/core/flight/reference/saturnV` no longer exports `F1_ENGINE`, `SATURN_V_AS506`, `SATURN_V_AS506_ASCENT`, `SATURN_V_AS506_EVENTS`, `SATURN_V_AS506_LAUNCH`.
- `@jgengine/core/flight/reference/standardAtmosphere` no longer exports `AtmosphereModel`, `AtmosphereSample`, `SEA_LEVEL_DENSITY`, `SEA_LEVEL_PRESSURE`, `SEA_LEVEL_SPEED_OF_SOUND`, `STANDARD_EARTH_RADIUS`, `STANDARD_GRAVITY`, `calibratedAirspeed` and 3 more.
- `@jgengine/core/physics/reference/boatComparison` no longer exports `BoatComparisonSubject`, `ManoeuvringSubject`, `ReferenceBoat`, `compareBoat`, `holtropExampleSubject`, `kvlcc2Subject`, `referenceBoatSubjects`, `referenceSubjectFor` and 3 more.
- `@jgengine/core/physics/reference/bondedRock` no longer exports `BASALT`, `BEREA_SANDSTONE`, `BondedRockModel`, `BondedSpecimen`, `BrazilianResult`, `CalibrationResult`, `GrainPacking`, `INDIANA_LIMESTONE` and 15 more.
- `@jgengine/core/physics/reference/carEffectProbe` no longer exports `CarEffectMetrics`, `CarEffectProbeOptions`, `CarEffectSubject`, `measureCarEffects`.
- `@jgengine/core/physics/reference/compareHandling` no longer exports `BikeHandlingComparison`, `ComparableHandlingMetrics`, `ComparableHandlingOptions`, `HandlingComparisonRow`, `MOTORCYCLE_PUBLISHED_TOLERANCES`, `MotorcyclePublishedCheck`, `PUBLISHED_TOLERANCES`, `PublishedCheck` and 13 more.
- `@jgengine/core/physics/reference/discreteElementExperiments` no longer exports `ColumnCollapseOptions`, `ColumnCollapseResult`, `DEM_GLASS_BEADS`, `DEM_SAND`, `DEM_STEEL`, `HopperOptions`, `HopperResult`, `JanssenFit` and 17 more.
- `@jgengine/core/physics/reference/discreteElements` no longer exports `DemBodySpec`, `DemBondLoad`, `DemBondSpec`, `DemInteraction`, `DemLiquid`, `DemMaterial`, `DemSnapshot`, `DemSphereSpec` and 11 more.
- `@jgengine/core/physics/reference/eigenvalues` no longer exports `polynomialRoots`.
- `@jgengine/core/physics/reference/hullForm` no longer exports `HullMesh`, `HullOffsets`, `PrismaticPlaningHullOptions`, `WigleyHullOptions`, `boxBarge`, `hullMeshFromOffsets`, `meshVolume`, `prismaticPlaningHull` and 1 more.
- `@jgengine/core/physics/reference/hullHydrostatics` no longer exports `FloatingAttitude`, `FloatingCondition`, `HullIntegrator`, `HullLoads`, `HullWater`, `HydrostaticParticulars`, `MARINE_GRAVITY`, `RightingArmPoint` and 10 more.
- `@jgengine/core/physics/reference/magicFormulaTire` no longer exports `MagicFormulaCoefficients`, `MagicFormulaContactState`, `MagicFormulaInput`, `MagicFormulaOutput`, `MagicFormulaTire`, `MagicFormulaTireOptions`, `MagicFormulaTireState`, `MagicFormulaTireStep` and 11 more.
- `@jgengine/core/physics/reference/marinePropeller` no longer exports `BSeriesPropeller`, `OpenWaterPoint`, `PropellerOperatingPoint`, `ScrewBladeSection`, `Waterjet`, `WaterjetPoint`, `bSeriesBladeSection`, `bSeriesOpenWater` and 5 more.
- `@jgengine/core/physics/reference/motorcycleManeuvers` no longer exports `BikeCourseSubject`, `BikeHandlingMetrics`, `BikeHandlingOptions`, `BikeScenario`, `measureBikeHandling`.
- `@jgengine/core/physics/reference/motorcycleRider` no longer exports `MotorcycleRiderOptions`, `RiddenMotorcycle`, `RiddenMotorcycleState`, `createRiddenMotorcycle`.
- `@jgengine/core/physics/reference/motorcycleTire` no longer exports `MotorcycleTireCoefficients`, `MotorcycleTireInput`, `MotorcycleTireOutput`, `SPORT_FRONT_120_70_ZR17`, `SPORT_REAR_180_55_ZR17`, `motorcycleMagicFormula`.
- `@jgengine/core/physics/reference/oceanWaves` no longer exports `IrregularSeaOptions`, `OceanSea`, `SeaSpectrum`, `WaveComponent`, `irregularSea`, `regularSea`, `seaElevation`, `seaWaterAt` and 2 more.
- `@jgengine/core/physics/reference/planingHull` no longer exports `NACA_TN2876_MODEL`, `NACA_TN2876_RUNS`, `PlaningEquilibrium`, `PlaningFluid`, `PlaningHull`, `PlaningState`, `PrismaticPlaningRun`, `planingAtTrim` and 4 more.
- `@jgengine/core/physics/reference/realCars` no longer exports `MAZDA_MX5_ND`, `REAL_CARS`, `RealCar`, `RealCarTestData`, `SCION_FRS_2013`.
- `@jgengine/core/physics/reference/realMotorcycles` no longer exports `GSXR1000_SHARP_2004`, `PublishedMotorcyclePerformance`, `REAL_MOTORCYCLES`, `RealMotorcycle`.
- `@jgengine/core/physics/reference/referenceCar` no longer exports `ReferenceAero`, `ReferenceAxle`, `ReferenceBrakes`, `ReferenceCar`, `ReferenceCarOptions`, `ReferenceCarSpec`, `ReferenceCarState`, `ReferenceCarStep` and 7 more.
- `@jgengine/core/physics/reference/referenceMotorcycle` no longer exports `MotorcycleBody`, `MotorcycleControls`, `MotorcycleModes`, `MotorcyclePowertrain`, `MotorcycleRearLinkage`, `MotorcycleWheel`, `ReferenceMotorcycle`, `ReferenceMotorcycleOptions` and 6 more.
- `@jgengine/core/physics/reference/rigidBodyTree` no longer exports `RigidBodyDefinition`, `RigidBodyTree`, `RigidBodyTreeState`, `RigidJoint`, `createRigidBodyTree`.
- `@jgengine/core/physics/reference/rungeKutta` no longer exports `RungeKutta4`, `createRungeKutta4`.
- `@jgengine/core/physics/reference/seakeepingHull` no longer exports `SeakeepingHull`, `SeakeepingHullOptions`, `SeakeepingState`, `SeakeepingStation`, `SurgeForce`, `restingSeakeepingState`, `seakeepingHullFromStrip`, `stepSeakeeping`.
- `@jgengine/core/physics/reference/sectionHydrodynamics` no longer exports `HalfSection`, `SectionHeave`, `lewisSection`, `sectionHeave`.
- `@jgengine/core/physics/reference/shipManoeuvring` no longer exports `KVLCC2_L7`, `KVLCC2_L7_PUBLISHED`, `KVLCC2_L7_SPEED`, `ManoeuvringTrialBoat`, `MmgForces`, `MmgHullDerivatives`, `MmgPropeller`, `MmgRudder` and 11 more.
- `@jgengine/core/physics/reference/shipResistance` no longer exports `HOLTROP_MENNEN_EXAMPLE`, `HoltropConditions`, `HoltropHull`, `HoltropPropeller`, `HoltropPropulsionFactors`, `HoltropResistance`, `SEA_WATER_VISCOSITY`, `holtropMennenResistance` and 3 more.
- `@jgengine/core/physics/reference/standardManeuvers` no longer exports `StandardManeuver`, `StandardManeuverOptions`, `StandardManeuverReport`, `measureStandardManeuvers`.
- `@jgengine/core/physics/reference/stripTheory` no longer exports `HeavePitchCoefficients`, `HeavePitchResponse`, `StripHull`, `StripSections`, `heavePitchResponse`, `stripSections`.
- `@jgengine/core/physics/reference/suspensionKinematics` no longer exports `DoubleWishboneGeometry`, `MacPhersonGeometry`, `SuspensionGeometry`, `SuspensionPoint`, `SuspensionPose`, `SuspensionSample`, `SuspensionTable`, `createSuspensionSample` and 2 more.
- `@jgengine/core/physics/reference/whippleBicycle` no longer exports `BENCHMARK_BICYCLE`, `BENCHMARK_BICYCLE_EIGENVALUES`, `WhippleBicycle`, `WhippleBicycleInput`, `WhippleBicycleParameters`, `WhippleBicycleSnapshot`, `WhippleBicycleStart`, `WhippleBicycleState` and 7 more.
