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

## Self-hosted Convex (no cloud account)

The Convex backend is open source (FSL-1.1-Apache-2.0) and this directory ships a
`docker-compose.yml` for it, so nothing here requires a Convex Cloud account. Running your own
game's backend this way is ordinary internal use under the FSL — the restriction only forbids
reselling Convex itself as a competing hosted service.

```sh
docker compose up -d
docker compose exec backend ./generate_admin_key.sh
```

Put the resulting key in this directory's `.env.local` and deploy the functions against your own
backend instead of the cloud:

```sh
CONVEX_SELF_HOSTED_URL='http://127.0.0.1:3210'
CONVEX_SELF_HOSTED_ADMIN_KEY='<key from generate_admin_key.sh>'
```

```sh
bunx convex dev
```

The CLI behaves identically against a self-hosted backend (codegen, deploys, crons — including the
1s tick — file storage, scheduled functions); it refuses to run if both cloud and self-hosted env
vars are set, so there's no wrong-target risk. The dashboard is at `http://localhost:6791`, and the
game client points at the backend the same way as ever: `VITE_CONVEX_URL=http://127.0.0.1:3210`.

Where to run the container: any VPS or Docker host, with official templates for
[Fly.io](https://github.com/get-convex/convex-backend/blob/main/self-hosted/advanced/fly/README.md)
and [Railway](https://railway.com/deploy/convex). It cannot run on Vercel — the backend is a
long-running stateful WebSocket process, the opposite of serverless functions. The split that works
is: game client (this repo's `apps/*` or your own site) on Vercel, backend container on Fly/Railway/
a VPS, connected by `VITE_CONVEX_URL`. Production notes from upstream: single-node only, pin the
image tag instead of `latest`, point `POSTGRES_URL`/`MYSQL_URL` at a managed database and own your
backups, set a real `INSTANCE_SECRET`, and set `CONVEX_CLOUD_ORIGIN`/`CONVEX_SITE_ORIGIN` to your
public URL when the backend isn't on localhost. Full upstream docs:
[self-hosting guide](https://github.com/get-convex/convex-backend/blob/main/self-hosted/README.md).

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
