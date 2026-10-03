### Added

- Shared player movement exposes cached, read-only grounded, vertical velocity and crouch telemetry through indexed possession ownership. Unknown actors and restored movement report no telemetry until a physical step completes.
- Model graph playback feeds resolved `grounded`, `verticalSpeed` and `crouched` parameters without writing the entity blackboard. `readModelAnimationParams` supplies the same behavior to custom render hosts with a reusable output dictionary; custom movers retain their authored parameters when motor telemetry is unavailable.

### Fixed

- Authored jump graphs can follow physical takeoff, apex, landing and buffered re-jumps rather than playing ground locomotion throughout a jump. Clip choices and transition policies remain game configuration; no rig-independent jump mapping is inferred.
