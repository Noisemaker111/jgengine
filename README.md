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
| [`@jgengine/shell`](packages/shell) | Game player shell: R3F canvas, orbit camera, input tracking, HUD mounting, `GameUiPreview`, demo game. You supply a `GameRegistry`. |
| [`@jgengine/assets`](packages/assets) | Self-generating, license-verified index of CC0 3D models: ships the typed index + pull CLI, not the GLB bytes. |

## Install

```sh
bun add @jgengine/core
# plus the adapters you need:
bun add @jgengine/react @jgengine/shell @jgengine/ws
bun add @jgengine/node @jgengine/sql   # server host
bun add @jgengine/convex               # Convex backend
```

Modules are imported by path, e.g.:

```ts
import { createGameRuntime } from "@jgengine/core/runtime/gameRuntime";
import { createWsBackend } from "@jgengine/ws/createWsBackend";
```

## Agent skills

Building a game with an AI coding agent? Install the JGengine skills (API reference, UI quality bar, one-pass workflow):

```sh
npx skills add Noisemaker111/jgengine
```

Then prompts like "make a tower defense game with jgengine" pick up the full engine surface and definition of done automatically. The skills live in [`skills/`](skills).

## Website — [jgengine.com](https://jgengine.com)

[`apps/web`](apps/web) is a TanStack Start app: a landing page for humans and a front door for agents. It points agents at `npx skills add Noisemaker111/jgengine` and explains which skill to grab for what — the skill pages are **rendered from `skills/`**, with no separate content to maintain.

It deploys to Vercel via Nitro on every push to `main`. Because the site is built from `skills/` and `packages/`, **shipping an engine or skill change redeploys the site with it** — the deploy of the engine is the deploy of the website. Setup in [`apps/web/README.md`](apps/web/README.md).

Every game under `Games/*` is also playable on jgengine.com itself, through the Games header dropdown at `/play/?game=<id>` — a static build of the `apps/dev` runner the site bundles at build time. Outside the browser, `bun dev` inside any `Games/<id>` directory (or an external game scaffolded per `jgengine-api`'s standalone dev harness) launches that same game on its own, no host app required.

## Layering

`core` imports nothing. `ws` and `sql` import only `core`. `react` adds React, `convex` adds Convex + React, `node` adds Node builtins + `ws`, `shell` adds React + three.js (the only package that renders).

## Development

```sh
bun install
bun run build        # tsc + import-extension rewrite, per package
bun run check-types
bun test packages
```

## Credits

JGengine's procedural buildings, water, rain, and snow renderers were shaped
from **[achrefelouafi](https://github.com/achrefelouafi)**'s MIT-licensed
Three.js reference projects. See [CREDITS.md](CREDITS.md) for the full mapping —
and go star his work.

## License

[AGPL-3.0-only](LICENSE)
