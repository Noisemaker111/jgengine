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


## Cloud game saves — `@jgengine/convex/convexSaveBackend`

For single-player (or per-user) game saves that live on the server instead of `localStorage`, pair the pluggable `@jgengine/core/game/saveStore` (`createSaveStore` — see `jgengine-gameplay` → "Whole-game save") with a Convex backend: `createConvexSaveBackend({ client, functions?, namespace? })` returns a `SaveBackend` whose reads/writes go through Convex. `defaultConvexSaveFunctions()` assumes a `saves.read`/`saves.write`/`saves.remove` module (a `key`→`value` string table keyed per user); pass your own `functions` refs to point at a different module, and a `namespace` to share one table across games/users. The game code is identical to the offline path — only the backend swaps from `localSaveBackend` to `createConvexSaveBackend`, so offline and cloud saves are one code path with autosave, slots, and versioned migration intact.

## Offline whole-world save — `defineGame({ persist })` / `ctx.game.save`

The single-player counterpart to hosted persistence. A multiplayer host serializes the whole world into a `WorldSnapshot` (`ctx.snapshot()`/`ctx.hydrate()`) to replicate it; the **same seam** persists an offline game to `localStorage`. Turn on `defineGame({ persist: true })` (wired only when `isOffline(multiplayer)` — never for a server-authoritative world, where the host persists) and the engine binds `ctx.game.save` (a `RuntimeSave`) to a local backend, autosaving the entire world — every `defineStore` slot, all entities + stats + inventories — with no per-field code. `createRuntimeSave({ target, backend, mode, ... })` (`@jgengine/core/runtime/runtimeSave`) is the bridge under it: `target` is any `{ snapshot, hydrate, subscribe }` (a `GameContext` satisfies it), `backend` is the same `SaveBackend` seam as `createSaveStore` — so swapping `localSaveBackend()` for `createConvexSaveBackend(...)` via the `createGameContext({ save })` seam moves an offline game's whole-world save to the cloud, unchanged. Modes: `"autosave"` (debounced, default) or `"manual"` + `checkpoint()` for save points / quest / area triggers. The game calls `ctx.game.save.load()` on boot to restore. Full authoring guide: `jgengine-gameplay` → "Save the *whole* game automatically".

## Dev save middleware — `@jgengine/node/devSavePlugin`

The published write path behind editor Save (Ctrl+S / `save_scene`) and the Tune tab's Save-to-source. Mount it on the game's dev server:

```ts
import { devSavePlugin, standaloneSavePlugin, handleSaveRequest } from "@jgengine/node/devSavePlugin";

standaloneSavePlugin()                       // scaffolded standalone game: saves into <root>/src
devSavePlugin((gameId) => srcDirFor(gameId)) // multi-game host: resolve each game's src dir
handleSaveRequest(resolveSrcDir, body)       // transport-free core for a non-Vite dev server
```

Dev-only (`apply: "serve"`); writes `editor.scene.json` and rewrites tunable literals under the resolved `src/`. See `jgengine-editor` for the editing workflow.
