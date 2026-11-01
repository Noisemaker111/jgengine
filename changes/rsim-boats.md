the runtime hull reproduces the reference: resistance, planing trim, propeller thrust, MMG manoeuvring and seakeeping on a shared sea state, each a named effect a game can switch on; boatFromReference gives a real boat in one line

### Added

- the runtime hull reproduces the reference: resistance, planing trim, propeller thrust, MMG manoeuvring and seakeeping on a shared sea state, each a named effect a game can switch on; boatFromReference gives a real boat in one line
- each boat effect has a strength, a multiplier from 0 (the simple model's term) where 1 is exactly the reference measurement and the dial keeps going past it, finite and monotone over 0 to 4; boatFromReference takes per-boat overrides so a fleet is data
- `hullSurgeAddedMass` (`@jgengine/core/physics/boatDynamics`): Surge added mass of a hull as half a prolate spheroid of its length and twice its volume (the double-body image across the still surface): Lamb's `k₁ = α₀/(2 − α₀)` times the displaced mass. Also `BoatAddedMass`, `BoatEffects`.
- `hullManoeuvringForces` (`@jgengine/core/physics/boatManoeuvring`): Hull forces from drift and yaw rate at midship (the MMG `X_H` without straight-running resistance, `Y_H`, `N_H`). Also `HullManoeuvring`, `ManoeuvringDerivatives`, `ManoeuvringLoads`, `ManoeuvringRudder`, `RudderInflow`, `rudderForces`.
- `planingForces` (`@jgengine/core/physics/boatPlaning`): Savitsky's (1964) planing forces at a trim: the mean wetted length that carries the weight, the mean bottom velocity, Schoenherr friction, the centre of pressure `l_p/(λb) = 0.75 − 1/(5.21·C_V²/λ² + 2.39)`, and the trimming moment about G with the thrust line. Also `PlaningBottom`, `PlaningForces`, `planingTrim`.
- `prepareOpenWater` (`@jgengine/core/physics/boatPropeller`): Reduces an open-water description to cubics in `J`: the B-series polynomials with pitch, area ratio and blades fixed (plus the ITTC-1978 correction `K_T −= ΔC_D·0.3·(P/D)·(cZ/D)`, `K_Q += ΔC_D·0.25·(cZ/D)` when full scale), or the given polynomial. Also `BoatEngine`, `BoatPropeller`, `PreparedOpenWater`, `PropellerOpenWater`, `PropellerPoint`, `propellerPoint`.
- `BOAT_REFERENCE_IDS` (`@jgengine/core/physics/boatReferences`): Every id {@link boatFromReference} accepts. Also `BoatOverrides`, `BoatReferenceId`, `boatFromReference`.
- `SEA_WATER_KINEMATIC_VISCOSITY` (`@jgengine/core/physics/boatResistance`): Kinematic viscosity of sea water at 15 °C (ITTC 7.5-02-01-03), m²/s. Also `BoatWater`, `FrictionLine`, `HullResistance`, `frictionLineCoefficient`, `prepareHullResistance`.
- `prepareSeakeeping` (`@jgengine/core/physics/boatSeakeeping`): Cuts a hull into strips at its draught and works out its heave–pitch added mass, damping and restoring about G at the reference frequency (strip theory, zero speed), its roll oscillator, and each strip's radiation solution. Also `HullOffsetTable`, `HullSeakeeping`, `PreparedSeakeeping`, `SeakeepingExcitation`, `SeakeepingLoads`, `SectionRadiation`, `seakeepingExcitation`, `seakeepingForces` and 3 more.
- `createWaveField` (`@jgengine/core/water/seaState`): Samples a spectrum into a deterministic wave field: frequencies in equal bands from 0.5ωp to 4ωp, each jittered within its band, amplitudes `√(2·S(ω)·Δω)`, seeded phases, and with `spreading` each heading drawn from `cos^(2s)` about the mean. Also `SeaStateSpectrum`, `WaveField`, `WaveFieldComponent`, `WaveFieldOptions`, `regularWaveField`, `seaSpectrumDensity`, `waveFieldHeight`, `waveFieldSignificantHeight`.

### Changed

- Part of #2837
