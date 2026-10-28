MMG standard method for ship manoeuvring in physics/reference: hull, propeller and rudder forces, or swung thrust for an outboard or waterjet, integrated in time.

### Added

- MMG standard method for ship manoeuvring in physics/reference: hull, propeller and rudder forces, or swung thrust for an outboard or waterjet, integrated in time.
- Turning-circle and zig-zag trials that run on the reference ship or a game boat. The KVLCC2 L7 model lands within 3% of the paper's turning indices and 1.5° of its zig-zag overshoots.
- bun run perf boat now also compares turning circles and zig-zags, on a KVLCC2 game build beside MARIN's free-running tests.
- `kvlcc2Subject` (`@jgengine/core/physics/reference/boatComparison`): The KVLCC2 L7 tanker model as a reference boat: its MMG model for resistance and manoeuvring, a game build with the same mass, rudder, steering rate and propeller (bollard thrust and zero-thrust speed at the self-propulsion revolutions), and MARIN's free-running turning and zig-zag results. Also `ManoeuvringSubject`.
- `KVLCC2_L7` (`@jgengine/core/physics/reference/shipManoeuvring`): The KVLCC2 L7 free-running model (1/45.7, MARIN) with the hull, propeller and rudder coefficients Yasukawa and Yoshimura used for their simulations (2015, Tables 1 and 3). Also `KVLCC2_L7_PUBLISHED`, `KVLCC2_L7_SPEED`, `ManoeuvringTrialBoat`, `MmgForces`, `MmgHullDerivatives`, `MmgPropeller`, `MmgRudder`, `MmgShip` and 10 more.

### Changed

- Part of #2698
