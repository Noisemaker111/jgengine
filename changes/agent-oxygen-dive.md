swimming can dive: movement.swim.dive makes crouch swim down to the bed and jump swim up, with telemetry diveDepth

Engine seam: packages/core/src/game/playableGame.ts, packages/core/src/movement/playerMovement.ts

### Added

- swimming can dive: movement.swim.dive makes crouch swim down to the bed and jump swim up, with telemetry diveDepth
- Fernwild breath: oxygen drains while the head is under water, refills at the surface, and drowning takes health (survival.oxygen-swim)
- `SwimDiveConfig` (`@jgengine/core/movement/playerMovement`): Metres a second a diver swims down, swims up, and drifts up with no input.

### Changed

- Diving and breath: crouch swims down, breath drains under water, drowning hurts
