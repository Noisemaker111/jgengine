the Rapier adapter is typed with handle maps and no per-contact scans, Rapier's character and vehicle controllers sit behind the backend seam, and games step at a fixed rate with render interpolation by default

Engine seam: packages/core/src/camera/GameFirstPersonCamera.draw.tsx, packages/core/src/camera/GameOrbitCamera.draw.tsx, packages/core/src/camera/cameraRigs.draw.tsx, packages/core/src/game/systemRuntime.ts, packages/core/src/movement/characterController.ts, packages/core/src/movement/playerMovement.ts, packages/core/src/physics/physicsBackend.ts, packages/core/src/physics/physicsBackendConformance.ts and 6 more

### Added

- `CharacterMotion` (`@jgengine/core/physics/physicsBackend`): A backend-native kinematic character mover: collide-and-slide, stepping, slopes and ground snap in the solver. Also `CharacterMotionDesc`, `CharacterMotionResult`, `PhysicsQuatOut`, `PhysicsVec3Out`, `RayCastVehicle`, `RayCastVehicleDesc`, `RayCastWheelDesc`, `RayCastWheelState`.
- `VehicleBackendLinkState` (`@jgengine/core/physics/vehicleBackendLink`): A link's serializable state: the pose its chassis last synced to.
- `DEFAULT_SIM_HZ` (`@jgengine/core/runtime/simLoop`): Steps per second a loop runs at when `hz` is not set: the physics backends' own substep rate, so one sim step is one solver step.
- `RapierSnapshot` (`@jgengine/rapier`): A Rapier backend's serializable state: the world bytes plus the engine-handle tables over Rapier's own handles.
- `RapierSnapshot` (`@jgengine/rapier/rapierBackend`): A Rapier backend's serializable state: the world bytes plus the engine-handle tables over Rapier's own handles.

### Changed

- Part of #2837

### Fixed

- the Rapier adapter is typed with handle maps and no per-contact scans, Rapier's character and vehicle controllers sit behind the backend seam, and games step at a fixed rate with render interpolation by default
