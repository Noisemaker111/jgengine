`bun run jgengine plants import|fit|write|report` imports FIA site trees, Carmean curves, Ek and Bechtold crown widths and Tallo crowns, and fits each species' growth by CMA-ES (Stava et al. 2014) across worker threads

### Added

- `bun run jgengine plants import|fit|write|report` imports FIA site trees, Carmean curves, Ek and Bechtold crown widths and Tallo crowns, and fits each species' growth by CMA-ES (Stava et al. 2014) across worker threads
- PLANT_LIBRARY of 10 fitted species (sugar and red maple, white and red pine, northern red oak, paper birch, white spruce, quaking aspen, basswood, balsam fir), each within ±15% height and ±25% DBH of FIA dominant trees and inside the Tallo p10–p90 crown width at 20, 50 and 100 years
- SPECIES_REFERENCE and REFERENCE_STAND, the imported targets every species is tested against
- `ABIES_BALSAMEA` (`@jgengine/core/plants/species/data/abiesBalsamea`): Balsam fir.
- `ACER_RUBRUM` (`@jgengine/core/plants/species/data/acerRubrum`): Red maple.
- `BETULA_PAPYRIFERA` (`@jgengine/core/plants/species/data/betulaPapyrifera`): Paper birch.
- `PICEA_GLAUCA` (`@jgengine/core/plants/species/data/piceaGlauca`): White spruce.
- `PINUS_RESINOSA` (`@jgengine/core/plants/species/data/pinusResinosa`): Red pine.
- `PLANT_LIBRARY` (`@jgengine/core/plants/species/data/plantLibrary`): Every species record the engine ships, registered with the grown-plant generator.
- `POPULUS_TREMULOIDES` (`@jgengine/core/plants/species/data/populusTremuloides`): Quaking aspen.
- `QUERCUS_RUBRA` (`@jgengine/core/plants/species/data/quercusRubra`): Northern red oak.
- `TILIA_AMERICANA` (`@jgengine/core/plants/species/data/tiliaAmericana`): American basswood.
- `REFERENCE_STAND` (`@jgengine/core/plants/species/speciesReference`): The stand a species is grown in to compare with its reference: fully stocked and even-aged, seen from a dominant tree. Also `GrowthCurve`, `SpeciesReference`, `crownWidthBandM`, `growthCurveAt`, `standDbhAtCm`, `standHeightAtM`.
- `SPECIES_REFERENCE` (`@jgengine/core/plants/species/speciesReferenceTable`): Written by `bun run jgengine plants import` from USDA FIA site trees and FVS (US public domain), Tallo (Jucker et al.
- `ForestCrownWidthEquation` (`@jgengine/core/plants/validation/crownAllometry`): Bechtold 2003 forest-grown crown width CW = a + b·D + cr·CR% + hi·HI in feet from DBH in inches, used from 5 in DBH, as coded in FVS Lake States `cwcalc.f` (US public domain). Also `OpenCrownWidthEquation`.

### Changed

- the reference stand is spaced for a dominant tree (spacing index 0.3, Oliver & Larson 1996), and 20-year DBH targets come from the FIA site trees' height–diameter relation where the site trees hold no trees that young
- Part of #2699

### Fixed

- species leaf area per mass comes from BAAD plants 5 m or taller, so a sapling's thin shade leaves no longer halve a canopy tree's foliage mass (sugar maple back to 22 m²/kg, inside the Jenkins 2003 crown-fuel band)

### Removed

- `@jgengine/core/physics/reference/boatComparison` no longer exports `wigleyStandIn`.
- `@jgengine/core/physics/reference/oceanWaves` no longer exports `IrregularSeaOptions`, `OceanSea`, `SeaSpectrum`, `WaveComponent`, `irregularSea`, `regularSea`, `seaElevation`, `seaWaterAt` and 2 more.
- `@jgengine/core/physics/reference/seakeepingHull` no longer exports `SeakeepingHull`, `SeakeepingHullOptions`, `SeakeepingState`, `SeakeepingStation`, `SurgeForce`, `restingSeakeepingState`, `seakeepingHullFromStrip`, `stepSeakeeping`.
- `@jgengine/core/physics/reference/sectionHydrodynamics` no longer exports `HalfSection`, `SectionHeave`, `lewisSection`, `sectionHeave`.
- `@jgengine/core/physics/reference/stripTheory` no longer exports `HeavePitchCoefficients`, `HeavePitchResponse`, `StripHull`, `StripSections`, `heavePitchResponse`, `stripSections`.
- `@jgengine/core/plants/grown/plantGrown` no longer exports `BUILTIN_PLANT_SPECIES`.
- `@jgengine/core/plants/validation/crownAllometry` no longer exports `CrownWidthEquations`, `EASTERN_WHITE_PINE_CROWN_WIDTH`, `SUGAR_MAPLE_CROWN_WIDTH`, `TALLO_CROWN_WIDTH`, `measuredCrownWidthBandM`.
- `@jgengine/core/plants/validation/heightAgeCurves` no longer exports `EASTERN_WHITE_PINE_CARMEAN`, `SUGAR_MAPLE_CARMEAN`.
- `@jgengine/core/plants/validation/stemAllometry` no longer exports `FIA_STAND_DIAMETER`, `StandDiameterAtAge`.
