# convex-host

`@jgengine/convex/server` ships the entire authoritative backend for a JGengine game — tables,
runtime command loop, save-cadence persistence, presence, chat, leaderboards, and crons — as a set
of factories. This example is the thin consumer: five one-line modules under `convex/` that call
those factories, plus a schema and a cron registration. There is no per-game logic here; any
JGengine game can point at this same deployment.

## Quickstart

```sh
bun install
bunx convex dev
```

`bunx convex dev` codegens `convex/_generated/` (which every module here imports for
`server`/`api` types) and prints your dev deployment URL. This package has no `check-types`
script because it cannot typecheck until `_generated/` exists.

Point a game at that URL and run it:

```sh
VITE_CONVEX_URL=<url> bun run dev --filter @jgengine-apps/dev
```

or set `VITE_CONVEX_URL` in `apps/dev/.env.local`. Any game whose `game.config.ts` declares
`multiplayer: convex({ topology: "shared" })` (voxel-mine does today) joins a shared server as
soon as it loads — no extra wiring on the client or server side.

## What syncs out of the box vs. what needs a runtime

Joining a shared server automatically gets you:

- pose presence (avatars for other players in the same server)
- chat on global channels
- whitelisted feed actions (e.g. `entity.died`) broadcast to members
- server and player persistence, on the save cadence the game declares
- leaderboards (global, per-server, and per-profile scopes)

None of that requires a line of server code beyond the five files in this directory. What stays
client-local until you register a game runtime is anything authoritative: validated commands, a
server-side tick loop, and save-on-cadence logic that actually mutates game state. To turn that
on, build a `GameRuntime` and hand it to `createGameServerFunctions`:

```ts
// convex/runtime.ts
import { createGameServerFunctions } from "@jgengine/convex/server";
import { createGameRuntime } from "@jgengine/core/runtime/gameRuntime";

const myRuntime = createGameRuntime({
  gameId: "voxel-mine",
  commands: myCommands,
  loop: myLoop,
  save: mySaveConfig,
});

export const {
  joinServer,
  leaveServer,
  runCommand,
  flushSave,
  getServer,
  getPlayerProfile,
  getFeed,
  pushFeedEntry,
  listOpenServers,
  tickActiveServers,
  flushDirtyServers,
} = createGameServerFunctions({ runtimes: [myRuntime] });
```

Games without a registered runtime fall back to a no-save runtime that only understands
`engine.ping`.

## Auth

By default every factory runs in `"anonymous"` mode: the client supplies its own player id
(`externalId`) and the server trusts it. That's fine for local development but spoofable — anyone
can claim any user id. For production, pass `{ auth: "required" }` to each factory:

```ts
createGameServerFunctions({ auth: "required" });
createLeaderboardFunctions({ auth: "required" });
createPresenceFunctions({ auth: "required" });
createChatFunctions({ auth: "required" });
```

and configure a Convex auth provider (`convex/auth.config.ts` plus whatever `ctx.auth` needs on
the client). In `"required"` mode the resolved actor is always `ctx.auth.getUserIdentity()`'s
`subject` — the `externalId` argument is only checked for consistency, never trusted on its own.

## Related hosts

`examples/express-host` and `examples/next-host` implement the same contract over a standalone
WebSocket process and Postgres/`@jgengine/sql` instead of Convex — use those if you don't want a
Convex deployment. `express-host` owns the authoritative tick loop and exposes
`ws://.../ws` plus `GET /api/*` reads; `next-host` is the client-and-reads half of that pair,
rendering the game shell and proxying reads to the same Postgres.
