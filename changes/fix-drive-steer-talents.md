driveStep steers in the steerYaw sign; talents.hydrate reports what it could not load

Closes #2238

### Migrate

- `driveStep` (`@jgengine/core/ai/driver`) now returns `steer` in the shared steer-right convention of `steerYaw`/`steerToward` (+1 = turn right). Delete any `-step.steer` negation and pass `steer` straight to the vehicle sim.

### Fixed

- `driveStep` returned steer with the opposite sign to `steerYaw`, so every adopter had to negate it; Drift Foundry and Harbor Heat drop their negations and drive the same lines.
