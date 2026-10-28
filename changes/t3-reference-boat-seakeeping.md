Ocean waves in physics/reference: Pierson–Moskowitz and JONSWAP spectra, a seeded irregular sea (long- or short-crested), and its pressure field for the hull integrator, so buoyancy and the nonlinear Froude–Krylov force come from one integral.

### Added

- Ocean waves in physics/reference: Pierson–Moskowitz and JONSWAP spectra, a seeded irregular sea (long- or short-crested), and its pressure field for the hull integrator, so buoyancy and the nonlinear Froude–Krylov force come from one integral.
- Frank close-fit heave added mass and damping of any ship section, and zero-speed strip theory for heave and pitch RAOs in head waves.
- A 6-DOF hull in waves (seakeepingHullFromStrip, stepSeakeeping) with strip-theory radiation and diffraction and momentum slamming. Its RAOs track strip theory within 6% for waves of 1.5 boat lengths and longer.
- bun run perf boat now also compares heave and pitch in head waves for every boat.
- `wigleyStandIn` (`@jgengine/core/physics/reference/boatComparison`): A Wigley hull (`C_B` 4/9) with a boat tuning's length, beam and mass, floating level with G on the waterline: the seakeeping stand-in for a boat whose real lines are unknown.
- `irregularSea` (`@jgengine/core/physics/reference/oceanWaves`): Samples a spectrum into a deterministic irregular sea: frequencies in equal bands from 0.5ωp to 4ωp, each jittered within its band so the record does not repeat, amplitudes `√(2·S(ω)·Δω)`, random phases, and with `spreading` each component given a heading drawn from `cos^(2s)` about the mean. Also `IrregularSeaOptions`, `OceanSea`, `SeaSpectrum`, `WaveComponent`, `regularSea`, `seaElevation`, `seaWaterAt`, `spectralMoment` and 1 more.
- `restingSeakeepingState` (`@jgengine/core/physics/reference/seakeepingHull`): The hull floating at rest in still water: G above the origin at its equilibrium height, heel and trim. Also `SeakeepingHull`, `SeakeepingHullOptions`, `SeakeepingState`, `SeakeepingStation`, `SurgeForce`, `seakeepingHullFromStrip`, `stepSeakeeping`.
- `lewisSection` (`@jgengine/core/physics/reference/sectionHydrodynamics`): A Lewis-form half-section `x = M((1 + a1) sin θ − a3 sin 3θ)`, `y = −M((1 − a1) cos θ + a3 cos 3θ)` from the keel (`θ = 0`) to the waterline (`θ = π/2`), fitted to a half-breadth, draft and section area coefficient. Also `HalfSection`, `SectionHeave`, `sectionHeave`.
- `heavePitchResponse` (`@jgengine/core/physics/reference/stripTheory`): Heave and pitch of a hull in regular head waves at zero speed by strip theory (Salvesen–Tuck–Faltinsen, `U = 0`): each section's added mass, damping and diffraction from {@link sectionHeave}, Froude–Krylov force from the incident pressure on the section contour, waterplane restoring, and the coupled heave–pitch equations solved about G. Also `HeavePitchCoefficients`, `HeavePitchResponse`, `StripHull`, `StripSections`, `stripSections`.

### Changed

- Part of #2698
