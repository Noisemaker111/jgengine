Two-legged animals get their own locomotion reference: whether a biped's leg muscles could carry a fast run (Hutchinson 2004), bird walk–run speeds and top speed, so Fernwild's theropods are no longer scored as quadrupeds.

Closes #2789

### Added

- `bipedRunning`: `requiredExtensorMass` and `bipedRunningSupport` compute the leg extensor mass a biped needs at each joint for fast running from Hutchinson's free-body model, with his published limb data for human, chicken, turkey, emu, ostrich, alligator and Tyrannosaurus in `HUTCHINSON_BIPEDS`
- `scaleBipedLimb`, `theropodMassFromLegLength` and `compareBiped` score a game biped of any size: walk or run by the ostrich walk–run Froude number (`BIRD_WALK_RUN_FROUDE`), top speed for its mass, and the muscle a fast run needs
- `validateBipedReference` checks it against Hutchinson's own required masses, his other theropod models, and ostrich and Tyrannosaurus top speeds
- `bun run games:capabilities locomotion --creatures ... --bipeds <id,...>` scores the named creatures as theropods; `--validate` also checks the biped reference
