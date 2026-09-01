# Physics strategy (decision record)

**Status:** accepted for current tree · critique action **Y1**

## Decision

Keep the in-tree **SoA `PhysicsWorld`** (`physicsWorld.ts`) as the default headless physics for games that need piles, joints, vehicles-lite, and tests without a native/WASM dep.

## Context

Critique tradeoff: custom physics is zero-dep and testable, but re-owns stability, rotation-rich joints, and tooling forever. Character walk uses a **separate** shell/controller path (`playerMovement`), not `PhysicsWorld`, unless a game binds sim bodies via `bodyBind`.

## Consequences

- Prefer `PhysicsWorld` for debris, carryables, simple vehicles, structure collapse.
- Prefer catalog movement + shell controller for FPS/third-person avatars.
- Revisit **Rapier (or similar)** only if a flagship needs rotation-rich ragdolls/vehicles that the SoA world cannot ship without multi-month investment — open a dedicated issue, not a drive-by.

## Update 2026-09 — the backend seam (#1682)

The range program needs rotation, capsules, CCD, and shapecasts, which `PhysicsWorld` cannot reach. Rather than
replace it, `physicsBackend.ts` defines the `PhysicsBackend` interface every consumer talks to, and
`physicsWorldBackend.ts` puts `PhysicsWorld` behind it (translation-only, non-box shapes as bounding boxes,
declared in `capabilities`). `physicsBackendConformance.ts` is the contract any adapter runs; `@jgengine/rapier`
is the planned native adapter behind the same seam. `movement/characterController.ts` is the first consumer:
a capsule collide-and-slide controller that works on any backend.

## Non-goals

Replacing movement controllers with full rigid-body characters by default.
