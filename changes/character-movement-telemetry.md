### Migrate

- Character controller standing and explicit crouch heights must be at least `2 * radius`, and crouch height must not exceed standing height. Invalid dimensions and control ranges now throw with repair guidance instead of creating a capsule below the declared feet.

### Added

- `playerMovementTelemetry(ctx, entityId)` (`@jgengine/core/movement/playerMovement`) exposes the last shared motor’s grounded, vertical velocity and crouch state through indexed ownership. It reuses a read-only view and returns `null` for unmanaged, unstepped or despawned entities, after restore/forget, and when another authority changes the motor proposal; it does not write animation stores each frame.

### Fixed

- Short characters’ default crouch height fits their capsule diameter. Retuning proportions recomputes omitted defaults while preserving explicit crouch height, and live declared capsule field changes retune the shared motor before its next move.
