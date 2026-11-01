# @jgengine/rapier

Rapier-backed physics adapter for the `@jgengine/core` `PhysicsBackend` seam.
It provides native capsules, shapecasts, rotation, CCD, joints, collision queries, and Rapier's own character and ray-cast vehicle controllers.

```ts
import { createRapierBackend } from "@jgengine/rapier";

const physics = await createRapierBackend();
```

## What it does

- Every body, collider and joint sits in a handle map, so a contact or a query hit finds its body in O(1) at any world size.
- `raycast`, `shapecast` and `overlap` take an optional `out` object; a hot caller reuses one and allocates nothing.
- Contacts report the manifold normal from `a` toward `b`, the summed impulse, and the closing speed that impulse stopped.
- `step(dt)` accumulates real time into fixed `fixedDt` slices (default 1/60 s), the same as the pure-TS backend.
- `snapshot()` / `restore()` round-trip the world with stable handles; controllers built on it are rebuilt after a restore.

## Controllers

Both are optional `PhysicsBackend` methods; the pure-TS backend has neither and keeps its own behaviour.

- `createCharacterMotion(desc)` wraps Rapier's `KinematicCharacterController`. Use it through `createCharacterController({ ..., backendMotion: true })`.
- `createRayCastVehicle({ chassis, wheels })` wraps Rapier's `DynamicRayCastVehicleController`. On a dynamic chassis Rapier owns suspension and tyres; `createVehicleBackendLink({ wheels })` uses it on its kinematic chassis for wheel contacts only.

## Deterministic build for multiplayer

The default `@dimforge/rapier3d-compat` build replays the same inputs to the same state on one machine.
Lockstep or rollback across different CPUs and browsers needs Rapier's cross-platform deterministic build, which has the same API.
Install it under the name this package imports, at the same version:

```json
{
  "dependencies": {
    "@dimforge/rapier3d-compat": "npm:@dimforge/rapier3d-deterministic-compat@0.19.3"
  }
}
```

With npm, put the same alias in `overrides`; with Bun or pnpm, use `overrides` or `pnpm.overrides`.
Then step every peer with the same `fixedDt` and the same inputs per tick, and start late joiners from a `snapshot()`.

Part of [JGengine](https://github.com/Noisemaker111/jgengine). Apache-2.0.
