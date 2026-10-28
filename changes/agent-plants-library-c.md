42 more species in the plant library, 52 in all, each fitted to FIA site trees, Carmean or FIA height curves and Tallo crowns, with columnar, weeping and multi-stemmed forms.

Root cause: the generator's species select had two hard-coded options; it now lists PLANT_LIBRARY.

### Added

- 42 more species in the plant library, 52 in all, each fitted to FIA site trees, Carmean or FIA height curves and Tallo crowns, with columnar, weeping and multi-stemmed forms.
- growth.basalStems (stems a seedling sets at its base) and growth.tropism.setpointMax (shoots may hang below the horizontal); DBH of a multi-stemmed tree is the quadratic sum of its stems.
- carbon.hydraulicHeightShare, the share of the species' maximum height its hydraulic limit sits at, fitted per species.
- the plant-library dev demo, a contact sheet of every species open-grown to 60 years.
- `ABIES_GRANDIS` (`@jgengine/core/plants/species/data/abiesGrandis`): Grand fir.
- `ABIES_LASIOCARPA` (`@jgengine/core/plants/species/data/abiesLasiocarpa`): Subalpine fir.
- `ACER_SACCHARINUM` (`@jgengine/core/plants/species/data/acerSaccharinum`): Silver maple.
- `BETULA_ALLEGHANIENSIS` (`@jgengine/core/plants/species/data/betulaAlleghaniensis`): Yellow birch.
- `CARYA_OVATA` (`@jgengine/core/plants/species/data/caryaOvata`): Shagbark hickory.
- `FAGUS_GRANDIFOLIA` (`@jgengine/core/plants/species/data/fagusGrandifolia`): American beech.
- `FRAXINUS_AMERICANA` (`@jgengine/core/plants/species/data/fraxinusAmericana`): White ash.
- `FRAXINUS_NIGRA` (`@jgengine/core/plants/species/data/fraxinusNigra`): Black ash.
- `FRAXINUS_PENNSYLVANICA` (`@jgengine/core/plants/species/data/fraxinusPennsylvanica`): Green ash.
- `JUGLANS_NIGRA` (`@jgengine/core/plants/species/data/juglansNigra`): Black walnut.
- `LARIX_LARICINA` (`@jgengine/core/plants/species/data/larixLaricina`): Tamarack.
- `LARIX_OCCIDENTALIS` (`@jgengine/core/plants/species/data/larixOccidentalis`): Western larch.
- `LIQUIDAMBAR_STYRACIFLUA` (`@jgengine/core/plants/species/data/liquidambarStyraciflua`): Sweetgum.
- `LIRIODENDRON_TULIPIFERA` (`@jgengine/core/plants/species/data/liriodendronTulipifera`): Yellow-poplar.
- `PICEA_ENGELMANNII` (`@jgengine/core/plants/species/data/piceaEngelmannii`): Engelmann spruce.
- `PICEA_MARIANA` (`@jgengine/core/plants/species/data/piceaMariana`): Black spruce.
- `PICEA_SITCHENSIS` (`@jgengine/core/plants/species/data/piceaSitchensis`): Sitka spruce.
- `PINUS_BANKSIANA` (`@jgengine/core/plants/species/data/pinusBanksiana`): Jack pine.
- `PINUS_CLAUSA` (`@jgengine/core/plants/species/data/pinusClausa`): Sand pine.
- `PINUS_CONTORTA` (`@jgengine/core/plants/species/data/pinusContorta`): Lodgepole pine.
- `PINUS_ECHINATA` (`@jgengine/core/plants/species/data/pinusEchinata`): Shortleaf pine.
- `PINUS_ELLIOTTII` (`@jgengine/core/plants/species/data/pinusElliottii`): Slash pine.
- `PINUS_PALUSTRIS` (`@jgengine/core/plants/species/data/pinusPalustris`): Longleaf pine.
- `PINUS_TAEDA` (`@jgengine/core/plants/species/data/pinusTaeda`): Loblolly pine.
- `PINUS_VIRGINIANA` (`@jgengine/core/plants/species/data/pinusVirginiana`): Virginia pine.
- `POPULUS_DELTOIDES` (`@jgengine/core/plants/species/data/populusDeltoides`): Eastern cottonwood.
- `POPULUS_GRANDIDENTATA` (`@jgengine/core/plants/species/data/populusGrandidentata`): Bigtooth aspen.
- `PRUNUS_SEROTINA` (`@jgengine/core/plants/species/data/prunusSerotina`): Black cherry.
- `PSEUDOTSUGA_MENZIESII` (`@jgengine/core/plants/species/data/pseudotsugaMenziesii`): Douglas-fir.
- `QUERCUS_ALBA` (`@jgengine/core/plants/species/data/quercusAlba`): White oak.
- `QUERCUS_COCCINEA` (`@jgengine/core/plants/species/data/quercusCoccinea`): Scarlet oak.
- `QUERCUS_FALCATA` (`@jgengine/core/plants/species/data/quercusFalcata`): Southern red oak.
- `QUERCUS_MACROCARPA` (`@jgengine/core/plants/species/data/quercusMacrocarpa`): Bur oak.
- `QUERCUS_MONTANA` (`@jgengine/core/plants/species/data/quercusMontana`): Chestnut oak.
- `QUERCUS_NIGRA` (`@jgengine/core/plants/species/data/quercusNigra`): Water oak.
- `QUERCUS_VELUTINA` (`@jgengine/core/plants/species/data/quercusVelutina`): Black oak.
- `ROBINIA_PSEUDOACACIA` (`@jgengine/core/plants/species/data/robiniaPseudoacacia`): Black locust.
- `THUJA_OCCIDENTALIS` (`@jgengine/core/plants/species/data/thujaOccidentalis`): Northern white-cedar.
- `THUJA_PLICATA` (`@jgengine/core/plants/species/data/thujaPlicata`): Western redcedar.
- `TSUGA_CANADENSIS` (`@jgengine/core/plants/species/data/tsugaCanadensis`): Eastern hemlock.
- `TSUGA_HETEROPHYLLA` (`@jgengine/core/plants/species/data/tsugaHeterophylla`): Western hemlock.
- `ULMUS_AMERICANA` (`@jgengine/core/plants/species/data/ulmusAmericana`): American elm.

### Changed

- a Tallo DBH class with under 10 trees of the species takes its genus's trees, flagged genus; FIA height curves are anchored at breast height; BAAD leaf area per mass counts only plants 5 m and taller.
- species the fit could not hold inside the limits are replaced: coast redwood by black locust, Scots pine by Virginia pine, red spruce by eastern cottonwood, eastern redcedar by southern red oak, white fir by water oak, ponderosa pine by sand pine.
- Part of #2699

### Fixed

- the grown-plant generator's species picker listed only sugar maple and white pine, so a scene asking for any other species got a sugar maple.
- scale-leaved species are sized by their spray, so cedars no longer starve; longleaf pine carries 2 needles per node.

### Removed

- `@jgengine/core/fracture/convexCell` no longer exports `CellFace`, `CellPlane`, `CellVec`, `ConvexCell`, `boxCell`, `cellContains`, `cellVolume`, `clipCell` and 1 more.
- `@jgengine/core/fracture/fractureComparison` no longer exports `FractureComparisonRow`, `compareFracture`, `formatFractureComparison`.
- `@jgengine/core/fracture/fragmentSize` no longer exports `FragmentSizes`, `GaudinSchuhmannFit`, `KWH_PER_TONNE`, `RosinRammlerFit`, `SizeFit`, `T10Fit`, `breakageProbability`, `fitGaudinSchuhmann` and 7 more.
- `@jgengine/core/fracture/rockFracture` no longer exports `BASALT_BREAKAGE`, `FractureOptions`, `FractureResult`, `GRANITE_BREAKAGE`, `LIMESTONE_BREAKAGE`, `ROCK_BREAKAGE`, `RockBreakage`, `RockFragment` and 4 more.
- `@jgengine/core/fracture/rockFractureGenerator` no longer exports `FRACTURE_GENERATORS`, `ROCK_FRACTURE_GENERATOR`, `ROCK_FRACTURE_SCHEMA`, `fragmentMesh`, `rockCell`.
- `@jgengine/core/granular/granularExperiments` no longer exports `ContinuumCollapse`, `FlumeFlow`, `PouredHeap`, `continuumCollapse`, `inclinedFlume`, `pouredHeap`.
- `@jgengine/core/granular/granularLayer` no longer exports `GranularLayer`, `GranularLayerConfig`, `GranularLayerSnapshot`, `GranularPressReport`, `GranularStepReport`, `createGranularLayer`.
- `@jgengine/core/granular/granularMaterial` no longer exports `BekkerSoil`, `DAMP_SAND`, `DRY_SAND`, `GLASS_BEADS`, `GRAVEL`, `GranularMaterial`, `SANDY_LOAM`, `culmannHeight` and 7 more.
- `@jgengine/core/granular/granularTerrain` no longer exports `GranularTerrain`, `GranularTerrainOptions`, `LandformCoverPlacement`, `createGranularTerrain`, `landformLooseCover`.
- `@jgengine/core/landform/evolution/landscapeEvolution` no longer exports `CoastalParams`, `GlacialParams`.
- `@jgengine/core/landform/glacial/firstOrderIceFlow` no longer exports `FirstOrderGrid`, `FirstOrderIceFlow`, `FirstOrderInput`, `FirstOrderOptions`, `FirstOrderReport`, `createFirstOrderIceFlow`.
- `@jgengine/core/landform/glacial/glacierFlow` no longer exports `GlacierModel`.
- `@jgengine/core/landform/glacial/iceFlow` no longer exports `GLEN_RATE_FACTOR`, `ICE_WEIGHT`, `iceDeformationRate`.
- `@jgengine/core/landform/materials/sedimentCover` no longer exports `TILL_YIELD`.
- `@jgengine/core/math/cmaEvolutionStrategy` no longer exports `CmaEvolutionStrategy`, `CmaOptions`, `CmaState`, `createCmaEvolutionStrategy`.
- `@jgengine/core/movement/reference/anthropometry` no longer exports `AnthropometricTable`, `DE_LEVA_MALE`, `HUMAN_SEGMENT`, `PlanarHumanGeometry`, `SegmentParameters`, `planarHumanSegments`.
- `@jgengine/core/movement/reference/compareLocomotion` no longer exports `HumanLocomotionReference`, `LocomotionComparisonRow`, `LocomotionMetrics`, `LocomotionProbeOptions`, `compareLocomotion`, `defaultHumanReference`, `formatLocomotionComparison`, `measureLocomotion` and 1 more.
- `@jgengine/core/movement/reference/compareRagdollFall` no longer exports `INJURY_LIMITS`, `RagdollFallOptions`, `RagdollFallRow`, `compareRagdollFall`, `formatRagdollFall`, `humanRagdollConfig`, `measureRagdollFall`, `stockHumanoidRagdoll`.
- `@jgengine/core/movement/reference/curveRunning` no longer exports `CHANG_KRAM_CURVE_SPEEDS`, `RECREATIONAL_SPRINTER`, `SprintMechanics`, `maxCurveSpeed`, `minTurnRadius`.
- `@jgengine/core/movement/reference/footContact` no longer exports `ContactParameters`, `ContactPointState`, `GroundProfile`, `SHOE_ON_CONCRETE`, `footContactForce`, `slopeGround`, `stairGround`.
- `@jgengine/core/movement/reference/humanBody` no longer exports `FootForces`, `HumanBody`, `HumanBodyOptions`, `HumanBodyState`, `HumanJointTorques`, `HumanSide`, `createHumanBody`.
- `@jgengine/core/movement/reference/humanEnvelope` no longer exports `RECREATIONAL_SPRINT_PROFILE`, `SprintProfile`, `SprintState`, `slopeCostOfTransport`, `slopeSpeed`, `sprint`, `sprintTopSpeed`, `stoppingDistance` and 3 more.
- `@jgengine/core/movement/reference/humanFall` no longer exports `FallOptions`, `FallReport`, `FallTone`, `GRUBER_WOBBLING_MASSES`, `HEAD_ON_FLOOR`, `LANDING_ACTIVATION`, `PELVIS_ON_FLOOR`, `WobblingMass` and 2 more.
- `@jgengine/core/movement/reference/humanGaitAnalysis` no longer exports `GaitReport`, `LocomotionDriver`, `StanceForce`, `analyzeLocomotion`.
- `@jgengine/core/movement/reference/humanGaits` no longer exports `FITTED_WALKS`, `FittedWalk`, `WALK_TERRAIN`, `WalkTerrain`, `fittedWalk`, `measureWalk`.
- `@jgengine/core/movement/reference/humanJump` no longer exports `COUNTERMOVEMENT_JUMP`, `JumpParameters`, `JumpReport`, `simulateJump`.
- `@jgengine/core/movement/reference/humanReferenceValidation` no longer exports `HumanValidationRow`, `RUNNING_NET_COST`, `formatHumanValidation`, `validateHumanReference`.
- `@jgengine/core/movement/reference/jointStrength` no longer exports `HumanJointStrength`, `JointExertion`, `LegJoint`, `YOUNG_MALE_STRENGTH`, `maxJointTorque`.
- `@jgengine/core/movement/reference/muscleTendon` no longer exports `HILL_CONSTANTS`, `MuscleJointSpan`, `MuscleSpec`, `MuscleState`, `muscleMetabolicPower`, `stepMuscle`.
- `@jgengine/core/movement/reference/planarMultibody` no longer exports `PlanarMultibody`, `PlanarSegment`, `createPlanarMultibody`.
- `@jgengine/core/movement/reference/quadrupedGait` no longer exports `ALEXANDER_JAYES_CURSORIAL`, `CreatureLocomotion`, `FroudePowerLaw`, `MAMMAL_TOP_SPEEDS`, `QuadrupedBody`, `QuadrupedComparison`, `QuadrupedGait`, `QuadrupedStride` and 9 more.
- `@jgengine/core/movement/reference/reflexWalker` no longer exports `GEYER_HERR_MUSCLES`, `GEYER_HERR_REFLEXES`, `LegMuscle`, `LegStimulation`, `ReflexParameters`, `ReflexWalker`, `ReflexWalkerState`, `actuateLegMuscles` and 1 more.
- `@jgengine/core/movement/reference/springMassRunning` no longer exports `RECREATIONAL_RUNNER`, `SpringMassRunner`, `SpringMassStep`, `springMassStep`.
- `@jgengine/core/physics/reference/bondedRock` no longer exports `BASALT`, `BEREA_SANDSTONE`, `BondedRockModel`, `BondedSpecimen`, `BrazilianResult`, `CalibrationResult`, `GrainPacking`, `INDIANA_LIMESTONE` and 15 more.
- `@jgengine/core/physics/reference/discreteElementExperiments` no longer exports `ColumnCollapseOptions`, `ColumnCollapseResult`, `DEM_GLASS_BEADS`, `DEM_SAND`, `DEM_STEEL`, `HopperOptions`, `HopperResult`, `JanssenFit` and 17 more.
- `@jgengine/core/physics/reference/discreteElements` no longer exports `DemBodySpec`, `DemBondLoad`, `DemBondSpec`, `DemInteraction`, `DemLiquid`, `DemMaterial`, `DemSnapshot`, `DemSphereSpec` and 11 more.
- `@jgengine/core/terrain/surveyTerrain` no longer exports `SurveyCliff`, `SurveyHills`.
