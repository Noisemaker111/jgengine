driveStep steers in the steerYaw sign; talents.hydrate reports what it could not load

Closes #2238
Closes #2236

### Migrate

- `driveStep` (`@jgengine/core/ai/driver`) now returns `steer` in the shared steer-right convention of `steerYaw`/`steerToward` (+1 = turn right). Delete any `-step.steer` negation and pass `steer` straight to the vehicle sim.

### Added

- `TalentTree.hydrate` returns a `TalentHydrateResult` (`ok`, `issues`) naming each saved rank it dropped (`unknown-node`, `invalid-rank`) or clamped (`max-rank`), and warns once in dev.

### Fixed

- `driveStep` returned steer with the opposite sign to `steerYaw`, so every adopter had to negate it; Drift Foundry and Harbor Heat drop their negations and drive the same lines.
- `talents.hydrate` silently dropped saved ids this build does not author, so a save loaded a smaller kit with no warning; valid ranks still load and the rest are reported. Ember Command's own saved-pick guard is replaced by the hydrate result.
