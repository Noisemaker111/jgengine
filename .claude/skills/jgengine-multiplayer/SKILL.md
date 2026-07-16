---
name: jgengine-multiplayer
description: Multiplayer API: adapters, topology, authority, rooms, persistence.
---

# jgengine-multiplayer

**Import from package roots** — `@jgengine/{ws,node,sql,convex}` already export from their root; core seams live in the curated barrel `@jgengine/core/multiplayer`. Deep paths `@jgengine/core/multiplayer/<file>` still work for anything not re-exported.

## Flagship hosted path

Real game + host, not a missing gallery id: **[examples/HOSTED.md](../../../examples/HOSTED.md)** — `claudecraft` with `ws({ authority: "server" })` + `examples/express-host` (or Convex).

## Two runtimes (do not confuse them)

| Role | API | Who uses it |
| --- | --- | --- |
| **Game sim (authoring)** | `createGameContext` + `defineGame` / shell `onTick(ctx, dt)` | Every game |
| **Host command/snapshot loop** | `createGameRuntime` (`@jgengine/core/runtime/gameRuntime`) | `@jgengine/ws` / `@jgengine/node` / `@jgengine/convex` hosts only |

Games never need `createGameRuntime` for single-player or client loops. Hosts register one when `runCommand`/tick/save must be authoritative on the server. World shape for games is still `ctx.snapshot()` / `ctx.hydrate()`.

## Authority (presence vs shared sim)

| `authority` | Meaning |
| --- | --- |
| unset / `"client"` | **Presence-only** — each client runs its own `onTick`; presence/feeds/chat sync. Not a shared competitive sim. `isPresenceOnly(multiplayer)` / `resolveAuthority(multiplayer) === "client"` |
| `"server"` | Host-authoritative world; shell mirrors host state. `isServerAuthoritative(multiplayer)` / `resolveAuthority === "server"` |

`wsPresence()` / `convexPresence()` name the presence-only case explicitly — no silent default to trip over. `ws()` / `convex()` stay the primary form for a genuinely shared world: pass `{ authority: "server" }` and follow `examples/HOSTED.md`'s host recipe. A bare `ws()`/`convex()` (authority omitted) still resolves to presence-only for compatibility, but prefer `wsPresence()`/`convexPresence()` so the intent reads at the call site.

```ts
import { wsPresence, ws, isPresenceOnly, isServerAuthoritative, resolveAuthority } from "@jgengine/core/runtime/adapter";
wsPresence({ topology: "shared" }); // presence-only, explicit — resolveAuthority → "client"
ws({ topology: "shared", authority: "server" }); // shared world — needs a host, see examples/HOSTED.md
```

## Multiplayer and the backend seam

The transport/host/persistence seam — `createWsBackend`, protocol codec, browser-safe authoritative host + router, WebRTC P2P, the Node/Convex/SQL adapters, presence, and save cadence. Full surface: **[reference.md](https://github.com/Noisemaker111/jgengine/blob/main/.claude/skills/jgengine-multiplayer/reference.md)**.

## Host command middleware — rate limits, validation, authorization

`createHostRouter` (`@jgengine/ws`) ships a composable rate-limit → validate → authorize pipeline over `pose`/`runCommand`/`join`/`browse`/`voice`, wired via three opt-in `HostRouterOptions` fields — an unconfigured router behaves exactly as before:

```ts
import { createHostRouter, DEFAULT_COMMAND_LIMITS } from "@jgengine/ws";

createHostRouter({
  host,
  limits: DEFAULT_COMMAND_LIMITS, // per-op sliding-window budgets; omit for no rate limiting
  validate: {
    "move.to": { validate: (input) => (isVector3(input) ? null : { reason: "expected a Vector3" }) },
  }, // declared commands only — any other runCommand name is rejected as unknown
  authorize: ({ userId, op, command }) =>
    op !== "runCommand" || command !== "admin.kick" || isModerator(userId), // default allow
});
```

`createCommandMiddleware`/`createCommandRateLimiter`/`validateCommandInput` (`@jgengine/ws/commandMiddleware`) are the underlying composable pieces if a host wants the pipeline without the router.

## Per-viewer replication projection + area-of-interest — `defineGame({ replication })`

By default a host replicates the **whole world to every client**, so one client's private state (another player's inventory) rides the wire to everyone and every entity is sent regardless of distance. Declare a `ReplicationPolicy` (`@jgengine/core/runtime/worldProjection`) on the game and the authoritative host projects each client its own frame — changing only what a client *sees*, never the simulation, so the game plays identically:

```ts
defineGame({
  // …
  replication: {
    privatePerUser: true, // each player's private per-user state (inventory) goes only to that player
    aoiRadius: 60,        // an entity replicates to a viewer only within 60 units of the viewer's own entity (its stats too)
  },
});
```

Mechanics (the seam, for engine work): projection and change-detection ride the existing `SnapshotModule` replication contract (`@jgengine/core/runtime/worldSnapshot`) — no per-feature branch. A module opts into `project(data, viewer, world)` (narrow the payload for one `SnapshotViewer`; `world` is the raw baseline for cross-module culling) and `version()` (a monotone dirty counter). The core `entities`/`stats`/`inventory` modules attach projectors from the policy; the host replicator skips re-serializing an unchanged commit via `WorldReplicatorOptions.worldVersion` aggregated from those versions (`ctx.replicationVersion()`), and `ctx.snapshot(viewer)` / `HostedWorldSession.snapshotFor(viewer)` / `HostedGameRunner.projectsViewers()` carry the projected frame. WS fan-out (`createHostRouter`) is room-scoped: a presence/chat/voice/server broadcast touches only that room's subscribers, not every connection. Helpers `projectEntitiesForViewer` / `projectPerUserForViewer` / `projectByVisibleIds` / `visibleEntityIds` / `policyProjectsViewers` build projectors. Maintainer note: run `bun run gen:skill-api` on a clean checkout to regenerate `api.md` for these exports.

## Per-world state — never a module-global `Map`

One host process serves many worlds, so authoritative runtime state (heroes, mobs, auras, active sessions) must be **per-`GameContext`, never a module-scoped `Map`** — a module global is process-global and bleeds between `serverId`s on the same host. `createGameContext` already mints a fresh `EntityStore` per world; for game-side state use `perContext` (`@jgengine/core/runtime/perContext`): `const heroRuntimes = perContext(() => new Map())` at module scope, then `heroRuntimes(ctx).get(userId)` per world. It keys on context identity through a `WeakMap`, so state is isolated per world and reclaimed when the context is.

## UI — `@jgengine/react`


## Cloud game saves — `@jgengine/convex/convexSaveBackend`

For single-player (or per-user) game saves that live on the server instead of `localStorage`, pair the pluggable `@jgengine/core/game/saveStore` (`createSaveStore` — see `jgengine-gameplay` → "Whole-game save") with a Convex backend: `createConvexSaveBackend({ client, functions?, namespace? })` returns a `SaveBackend` whose reads/writes go through Convex. `defaultConvexSaveFunctions()` assumes a `saves.read`/`saves.write`/`saves.remove` module (a `key`→`value` string table keyed per user); pass your own `functions` refs to point at a different module, and a `namespace` to share one table across games/users. The game code is identical to the offline path — only the backend swaps from `localSaveBackend` to `createConvexSaveBackend`, so offline and cloud saves are one code path with autosave, slots, and versioned migration intact.

## Offline whole-world save — `defineGame({ persist })` / `ctx.game.save`

The single-player counterpart to hosted persistence. A multiplayer host serializes the whole world into a `WorldSnapshot` (`ctx.snapshot()`/`ctx.hydrate()`) to replicate it; the **same seam** persists an offline game to `localStorage`. Turn on `defineGame({ persist: true })` (wired only when `isOffline(multiplayer)` — never for a server-authoritative world, where the host persists) and the engine binds `ctx.game.save` (a `RuntimeSave`) to a local backend, autosaving the entire world — every `defineStore` slot, all entities + stats + inventories — with no per-field code. `createRuntimeSave({ target, backend, mode, ... })` (`@jgengine/core/runtime/runtimeSave`) is the bridge under it: `target` is any `{ snapshot, hydrate, subscribe }` (a `GameContext` satisfies it), `backend` is the same `SaveBackend` seam as `createSaveStore` — so swapping `localSaveBackend()` for `createConvexSaveBackend(...)` via the `createGameContext({ save })` seam moves an offline game's whole-world save to the cloud, unchanged. Modes: `"autosave"` (debounced, default) or `"manual"` + `checkpoint()` for save points / quest / area triggers. The game calls `ctx.game.save.load()` on boot to restore. Full authoring guide: `jgengine-gameplay` → "Save the *whole* game automatically".

## Hosted-world persistence and clean shutdown — `@jgengine/node/worldServer`, `@jgengine/node/shutdown`

`createWorldGameServer` (the GameContext-loop host, distinct from `createGameHost`'s reducer path above) takes a `persistence?: WorldPersistence` — `store({ gameId, serverId }) => HostedWorldStore` (the same `load()`/`save()` seam `createHostedWorldSession` already defines). Default `memoryWorldPersistence()` keeps today's in-memory-per-world behavior; inject a file/SQL/Convex-backed one to survive a redeploy or crash. `server.flush()` force-persists every live world outside the tick cadence; `server.close()` calls it before tearing down the ws server.

`installShutdownHook(shutdown, options?)` (`@jgengine/node/shutdown`) wires `SIGINT`/`SIGTERM` to a clean-shutdown callback (`() => server.close()`), bounded by `timeoutMs` (default 5s) so a stuck flush can't hang the process, idempotent against a second signal mid-shutdown, and removable (`hook.remove()`) for tests or an embedder with its own handling. Not wired automatically — call it once from the process entrypoint.

## Dev save middleware — `@jgengine/node/devSavePlugin`

The published write path behind editor Save (Ctrl+S / `save_scene`) and the Tune tab's Save-to-source. Mount it on the game's dev server:

```ts
import { devSavePlugin, standaloneSavePlugin, handleSaveRequest } from "@jgengine/node/devSavePlugin";

standaloneSavePlugin()                       // scaffolded standalone game: saves into <root>/src
devSavePlugin((gameId) => srcDirFor(gameId)) // multi-game host: resolve each game's src dir
handleSaveRequest(resolveSrcDir, body)       // transport-free core for a non-Vite dev server
```

Dev-only (`apply: "serve"`); writes `editor.scene.json` and rewrites tunable literals under the resolved `src/`. See `jgengine-editor` for the editing workflow.
