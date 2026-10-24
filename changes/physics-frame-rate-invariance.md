### Fixed

- `@jgengine/rapier` now accumulates `step(dt)` into its fixed substeps instead of stepping once per call with `fixedDt` as the timestep. A 1 s move covered 0.5 s of simulated time at 30 fps and 2.4 s at 144 fps; it now covers 1 s at either rate, matching `PhysicsWorld` and the `PhysicsBackend` contract.
- `PhysicsWorld` bounds-floor friction is Coulomb (`friction × g × dt`) like contact friction, not a 60 Hz multiplicative brake: a crate sliding at 4 m/s travelled 0.165 m on the world floor and 0.970 m on a floor collider, and now travels 0.967 m on both.
- Player and character-controller gravity integrate trapezoidally, so a jump reaches `v²/2g` at any frame rate: the default jump peaked at 0.933 m at 30 fps and 1.026 m at 144 fps, and now at 1.050 m for both.
