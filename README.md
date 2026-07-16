<p align="center">
  <img src="apps/web/public/og.png" alt="JGengine" width="640" />
</p>

# jgengine

**TypeScript game framework SDK for AI agents** — npm `jgengine` / `@jgengine/*` · site [jgengine.com](https://jgengine.com) · agent skills ship inside every package tarball (`node_modules/@jgengine/<pkg>/skills/`).

> Not related to automotive “JG Engines” / “JG Engine Dynamics”. This is software — a pure-TypeScript **framework** (entity stores, commands, catalogs, multiplayer seams, R3F shell), not an ECS and not a general-purpose 3D engine.

Built so coding agents can ship games from a short prompt. Skills provide intake, focused API guidance, and verification. `@jgengine/core` has no React, no renderer, and no backend dependency — adapters connect it to React, Convex, WebSockets, Node hosting, and Postgres (socket.io, WebRTC P2P, and LAN share the same protocol). Domains are opt-in at runtime via `defineGame({ features })`; the monorepo still ships a wide primitive set — skills route selectively so agents do not load every domain by default.

**Backlog from the 2026-07 critique:** [CRITIQUE-ACTIONS.md](CRITIQUE-ACTIONS.md).

## Packages

**Versions:** the lockstep game SDK set is `@jgengine/{core,react,ws,node,sql,convex,shell,editor,assets}` (currently **0.10.x** — bump together). Separate cadences: CLI package `jgengine` and `@jgengine/github` (may lag; not part of that lockstep set).

| Package | What it is |
| --- | --- |
| [`@jgengine/core`](packages/core) | Framework core: `GameContext`, entity/object stores, commands, combat, inventory, multiplayer contracts, world features. Zero dependencies. Import by deep path. |
| [`@jgengine/react`](packages/react) | React UI layer: `GameProvider`, hooks, headless primitives. |
| [`@jgengine/ws`](packages/ws) | Browser-safe game backend over a pluggable transport pipe (WebSocket/socket.io/WebRTC/loopback): protocol codec, `createWsBackend`, `createHttpReads`, a browser-safe authoritative host + router, and WebRTC P2P sessions. |
| [`@jgengine/node`](packages/node) | Node bindings over `@jgengine/ws`'s host: WebSocket server, socket.io server attach, memory/file persistence, save-cadence flush. |
| [`@jgengine/sql`](packages/sql) | `HostPersistence` on Postgres through a structural pool interface (no hard `pg` dependency). |
| [`@jgengine/convex`](packages/convex) | Convex adapters: game transport, presence transport. |
| [`@jgengine/shell`](packages/shell) | Game player shell: R3F canvas, orbit camera, input tracking, HUD mounting, `GameUiPreview`, demo game. You supply a `GameRegistry`. |
| [`@jgengine/assets`](packages/assets) | Self-generating, license-verified index of CC0 3D models: ships the typed index + pull CLI, not the GLB bytes. |
| [`@jgengine/editor`](packages/editor) | Scene/world/asset editor, loaded lazily by the runner; runs standalone on any folder via `npx jgengine editor` or the desktop app (`StandaloneEditor`); agent bridge via `jgengine editor-mcp`. |
| [`@jgengine/github`](packages/github) | GitHub data source: contribution calendar fetch for games that render real profile data. Zero dependencies. Own version line. |
| [`jgengine`](packages/jgengine) | Agent-side CLI (`npx jgengine`) — create, skills, doctor, desktop. Own version line. **People** tell an agent *Make a game that … with jgengine*. |

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
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { createWsBackend } from "@jgengine/ws/createWsBackend";
```

## How people build games (outside this monorepo)

**One interface.** Open any coding agent and say:

```text
Make a game that ... with jgengine
```

Examples: *Make a game that is Mario Party with goo characters, with jgengine* · *Make a game that is a first-person voxel miner, with jgengine*.

That is the whole product surface for humans. No install checklist, no “run skills first,” no required CLI.

Under the hood the agent uses `npx jgengine` (create, skills, doctor) and the skills in [`.claude/skills/`](.claude/skills) — an intake router plus focused API domains, staged into every published tarball at `skills/` so they travel with `node_modules`. Power users may call the CLI themselves; that is optional, not the entry.

The game the agent builds is **its own project in its own repo/directory**, on the published npm packages. Agents must **never clone this monorepo** to build a game, and must **never copy code, assets, or content from `Games/*`** — those are private in-repo test games (some recreate well-known commercial titles for engine-gap probing), not templates, and their content is not licensed for reuse. `npx jgengine create` is the only starting point.

## Website — [jgengine.com](https://jgengine.com)

[`apps/web`](apps/web) is a TanStack Start app: landing for humans (the prompt) and skill/API pages for agents. Skill pages are **rendered from `.claude/skills/jgengine-*`**, with no separate content to maintain.

It deploys to Vercel via Nitro on every push to `main`. Because the site is built from `.claude/skills/` and `packages/`, **shipping an engine or skill change redeploys the site with it** — the deploy of the engine is the deploy of the website. Setup in [`apps/web/README.md`](apps/web/README.md).

Every game under `Games/*` is also playable on jgengine.com itself, at `/games/<id>` via the games page and header dropdown — the page embeds the `apps/dev` runner, which the site bundles as a static build at build time. Root `bun dev` runs this same website locally with the runner served for it in dev, so the games are playable at `/games/<id>` locally too. Outside the browser, `bun run games:<id>` at the root (or `bun dev` inside any `Games/<id>` directory, or an external game scaffolded per `jgengine`'s standalone dev harness) launches one game on its own, no host app required.

## Layering

`core` imports nothing. `ws` and `sql` import only `core`. `react` adds React, `convex` adds Convex + React, `node` adds Node builtins + `ws`, `shell` adds React + three.js (the only package that renders). `editor` sits on top of `shell`/`react`/`core`; `assets` and `github` are standalone data packages games opt into.

## Development

```sh
bun install
bun run build        # tsgo + import-extension rewrite, per package
bun run check-types
bun run test
bun dev              # jgengine.com locally, games playable at /games/<id>
bun run games:<id>   # one game standalone, e.g. bun run games:studio-showcase
```

Windows: if `bun` is not recognized after installing, its install directory is missing from PATH — add `%USERPROFILE%\.bun\bin` (PowerShell: `[Environment]::SetEnvironmentVariable("Path", "$env:Path;$env:USERPROFILE\.bun\bin", "User")`) and reopen the terminal.

## Credits

JGengine's procedural buildings, water, rain, and snow renderers were shaped
from **[achrefelouafi](https://github.com/achrefelouafi)**'s MIT-licensed
Three.js reference projects. See [CREDITS.md](CREDITS.md) for the full mapping —
and go star his work.

## License

[AGPL-3.0-only](LICENSE).

**Who this fits.** AGPL is intentional for network-hosted engine derivatives: if you modify the engine and run it as a service, share the source. It is a good fit for OSS, research, and agent-built prototypes. **Shipping a closed commercial product on the engine needs a legal read** (and often a dual-license conversation with the maintainer) — do not assume AGPL is “permissive free.” See [CRITIQUE-ACTIONS.md](CRITIQUE-ACTIONS.md) H3.
