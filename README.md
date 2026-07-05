# JGengine

A genre-agnostic, pure-TypeScript game engine SDK. The core has no React, no renderer, and no backend dependency — adapters connect it to React, Convex, WebSockets, Node hosting, and Postgres.

## Packages

| Package | What it is |
| --- | --- |
| [`@jgengine/core`](packages/core) | The engine SDK: game runtime, transport/save, state store, entity scene + object store, pool stats/targeting/spatial, combat effects/projectiles/death, loot/trade/quest/social/loadout/unlocks/events/feed/leaderboard, item use, movement/camera/pose, input, interaction, inventory/stats/economy, world features, clocks. Zero dependencies. |
| [`@jgengine/react`](packages/react) | React UI layer: `GameProvider`, hooks, headless primitives. |
| [`@jgengine/ws`](packages/ws) | Browser-safe WebSocket client backend: protocol codec, `createWsBackend`, `createHttpReads`. |
| [`@jgengine/node`](packages/node) | Standalone authoritative game host: in-memory server snapshots, tick loop, save-cadence flush, WebSocket server, memory/file persistence. |
| [`@jgengine/sql`](packages/sql) | `HostPersistence` on Postgres through a structural pool interface (no hard `pg` dependency). |
| [`@jgengine/convex`](packages/convex) | Convex adapters: game transport, presence transport. |

## Install

```sh
bun add @jgengine/core
# plus the adapters you need:
bun add @jgengine/react @jgengine/ws
bun add @jgengine/node @jgengine/sql   # server host
bun add @jgengine/convex               # Convex backend
```

Modules are imported by path, e.g.:

```ts
import { createGameRuntime } from "@jgengine/core/runtime/gameRuntime";
import { createWsBackend } from "@jgengine/ws/createWsBackend";
```

## Layering

`core` imports nothing. `ws` and `sql` import only `core`. `react` adds React, `convex` adds Convex + React, `node` adds Node builtins + `ws`. Renderers (three.js etc.) live entirely in the consuming app.

## Development

```sh
bun install
bun run build        # tsc + import-extension rewrite, per package
bun run check-types
bun test packages
```

## License

[AGPL-3.0-only](LICENSE)
