Whipple bicycle benchmark (Meijaard et al. 2007): linear eigenvalues and weave/capsize speeds match the paper to 1e-11; a nonlinear multibody bicycle linearises to the same eigenvalues (worst gap 4e-12)

### Added

- Whipple bicycle benchmark (Meijaard et al. 2007): linear eigenvalues and weave/capsize speeds match the paper to 1e-11; a nonlinear multibody bicycle linearises to the same eigenvalues (worst gap 4e-12)
- createReferenceMotorcycle, Sharp, Evangelou & Limebeer's 2004 multibody GSX-R1000 with the motorcycle Magic Formula tyre; steered by torque only, so countersteer, weave and wobble come from the physics. At 75 m/s wobble is -1.83±46.5i and weave -0.39±28.2i (paper: -1.7±47.3i, -0.3±28.5i)
- createRiddenMotorcycle, a steering-torque rider that takes a game bike's AxisInput, and measureBikeHandling (launch, braking, lean, countersteer, lane change, slalom)
- compareBikeTuning and the handling command score any tuning with a lean block against the reference bike and MOTORRAD's 2001 GSX-R1000 test (0-100 3.22 s vs 2.9, 0-200 7.98 s vs 7.3, 100-0 38.3 m vs 38.6)
- rigidBodyTree (Featherstone CRBA/RNEA), matrix eigenvalues and a shared RK4; the reference car now uses the shared RK4 and linear solve
- `matrixEigenvalues` (`@jgengine/core/math/linearAlgebra`): Eigenvalues of a real square matrix (row-major, `n × n`): balancing, reduction to upper Hessenberg form by stabilised elimination, then the Francis double-shift QR iteration (Wilkinson & Reinsch, *Handbook for Automatic Computation* II, the EISPACK `balanc`/`elmhes`/`hqr` scheme). Also `Eigenvalue`, `solveLinearSystem`.
- `MOTORCYCLE_PUBLISHED_TOLERANCES` (`@jgengine/core/physics/reference/compareHandling`): How close the reference motorcycle must land to each published number: braking within 5%, 0-100 and 0-200 km/h within 12% (the torque curve between the engine's published peaks and its inertia are estimates). Also `BikeHandlingComparison`, `MotorcyclePublishedCheck`, `checkReferenceMotorcycle`, `compareBikeMetrics`, `compareBikeTuning`, `measureReferenceMotorcycle`, `validateReferenceMotorcycles`.
- `polynomialRoots` (`@jgengine/core/physics/reference/eigenvalues`): Roots of the real polynomial `c[0] + c[1]·λ + … + c[n]·λⁿ` (`c[n] ≠ 0`): the companion-matrix eigenvalues, then two Newton steps on the polynomial itself to recover full double precision.
- `measureBikeHandling` (`@jgengine/core/physics/reference/motorcycleManeuvers`): Drives fresh bikes from `create` through every bike scenario: a launch (0-100, 0-200 km/h), braking from 100 km/h, a full-steer lean test like `measureLean` (plus the lateral g the lean holds), an ISO 3888-1 double lane change with lanes sized for the bike, and a slalom. Also `BikeCourseSubject`, `BikeHandlingMetrics`, `BikeHandlingOptions`, `BikeScenario`.
- `createRiddenMotorcycle` (`@jgengine/core/physics/reference/motorcycleRider`): Puts a steering-torque rider on a reference motorcycle; the bike only ever gets a bar torque, so countersteer, the lean response and its limits come from the multibody physics. Also `MotorcycleRiderOptions`, `RiddenMotorcycle`, `RiddenMotorcycleState`.
- `SPORT_FRONT_120_70_ZR17` (`@jgengine/core/physics/reference/motorcycleTire`): Front 120/70 ZR17 sport tyre (Sharp, Evangelou & Limebeer 2004, Tables II–III middle rows; longitudinal shape from the 160/70 fit with pDx1 = 1.381, pDx2 = −0.04143, §4.5; relaxation §4.8). Also `MotorcycleTireCoefficients`, `MotorcycleTireInput`, `MotorcycleTireOutput`, `SPORT_REAR_180_55_ZR17`, `motorcycleMagicFormula`.
- `GSXR1000_SHARP_2004` (`@jgengine/core/physics/reference/realMotorcycles`): Suzuki GSX-R1000 K1 (2001) with a prone rider, the machine of Sharp, Evangelou & Limebeer, "Advances in the modelling of motorcycle dynamics", *Multibody System Dynamics* 12 (2004) 251–283, Appendix tables A.I–A.VIII: masses, inertias, geometry, stops, stiffness, damping and aerodynamics as published, tyres from their section 3. Also `PublishedMotorcyclePerformance`, `REAL_MOTORCYCLES`, `RealMotorcycle`.
- `createReferenceMotorcycle` (`@jgengine/core/physics/reference/referenceMotorcycle`): Creates a {@link ReferenceMotorcycle}: the multibody motorcycle of {@link ReferenceMotorcycleSpec} on a {@link createRigidBodyTree} (13 degrees of freedom), integrated by classical RK4 at 0.5 ms under a 1 kHz control sample. Also `MotorcycleBody`, `MotorcycleControls`, `MotorcycleModes`, `MotorcyclePowertrain`, `MotorcycleRearLinkage`, `MotorcycleWheel`, `ReferenceMotorcycle`, `ReferenceMotorcycleOptions` and 5 more.
- `createRigidBodyTree` (`@jgengine/core/physics/reference/rigidBodyTree`): Creates a {@link RigidBodyTree}: a tree of rigid bodies on free, revolute and prismatic joints with exact dynamics in spatial-vector form (Featherstone, *Rigid Body Dynamics Algorithms*, 2008): the composite-rigid-body algorithm for the mass matrix and the recursive Newton–Euler algorithm for the velocity-product and applied forces. Also `RigidBodyDefinition`, `RigidBodyTree`, `RigidBodyTreeState`, `RigidJoint`.
- `createRungeKutta4` (`@jgengine/core/physics/reference/rungeKutta`): Creates a {@link RungeKutta4} for states of `size` entries; its scratch buffers are allocated once, so a step allocates nothing. Also `RungeKutta4`.
- `BENCHMARK_BICYCLE` (`@jgengine/core/physics/reference/whippleBicycle`): The benchmark bicycle of Meijaard et al. Also `BENCHMARK_BICYCLE_EIGENVALUES`, `WhippleBicycle`, `WhippleBicycleInput`, `WhippleBicycleParameters`, `WhippleBicycleSnapshot`, `WhippleBicycleStart`, `WhippleBicycleState`, `WhippleLinearCoefficients` and 6 more.

### Changed

- Part of #2698
- Shared matrixEigenvalues and solveLinearSystem now live in core math/; flight trim and the bike use the same ones

### Fixed

- the reference rigid-body tree can snapshot and restore its state

### Removed

- `@jgengine/core/flight/reference/aircraftTrim` no longer exports `Eigenvalue`, `matrixEigenvalues`, `solveLinearSystem`.
- `@jgengine/core/scatter/scatterGenerator` no longer exports `scatterPlacementVariant`.
- `@jgengine/core/scatter/scatterHeroes` no longer exports `ScatterHeroMember`, `ScatterHeroSet`, `ScatterHeroSetOptions`, `ScatterHeroSetState`, `ScatterHeroUpdate`, `createScatterHeroSet`.
- `@jgengine/core/scatter/ScatterHeroes.draw` no longer exports `ScatterHeroesProps`.
