---
name: jgengine-multiplayer
description: Multiplayer API: adapters, topology, authority, rooms, persistence.
---

# jgengine-multiplayer

## Multiplayer and the backend seam

The transport/host/persistence seam — `createWsBackend`, protocol codec, browser-safe authoritative host + router, WebRTC P2P, the Node/Convex/SQL adapters, presence, and save cadence. Full surface: **[reference.md](https://github.com/Noisemaker111/jgengine/blob/main/.claude/skills/jgengine-multiplayer/reference.md)**.

## Per-world state — never a module-global `Map`

One host process serves many worlds, so authoritative runtime state (heroes, mobs, auras, active sessions) must be **per-`GameContext`, never a module-scoped `Map`** — a module global is process-global and bleeds between `serverId`s on the same host. `createGameContext` already mints a fresh `EntityStore` per world; for game-side state use `perContext` (`@jgengine/core/runtime/perContext`): `const heroRuntimes = perContext(() => new Map())` at module scope, then `heroRuntimes(ctx).get(userId)` per world. It keys on context identity through a `WeakMap`, so state is isolated per world and reclaimed when the context is.

## UI — `@jgengine/react`

