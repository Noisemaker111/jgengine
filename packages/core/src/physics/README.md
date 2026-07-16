# Physics strategy (ADR)

**Status:** accepted for current tree · critique action **Y1**

## Decision

Keep the in-tree **SoA `PhysicsWorld`** (`physicsWorld.ts`) as the default headless physics for games that need piles, joints, vehicles-lite, and tests without a native/WASM dep.

## Context

Critique tradeoff: custom physics is zero-dep and testable, but re-owns stability, rotation-rich joints, and tooling forever. Character walk uses a **separate** shell/controller path (`playerMovement`), not `PhysicsWorld`, unless a game binds sim bodies via `bodyBind`.

## Consequences

- Prefer `PhysicsWorld` for debris, carryables, simple vehicles, structure collapse.
- Prefer catalog movement + shell controller for FPS/third-person avatars.
- Revisit **Rapier (or similar)** only if a flagship needs rotation-rich ragdolls/vehicles that the SoA world cannot ship without multi-month investment — track as a new CRITIQUE-ACTIONS row, not drive-by.

## Non-goals

Replacing movement controllers with full rigid-body characters by default.
