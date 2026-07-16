# @jgengine/convex

Convex adapters for [JGengine](https://github.com/Noisemaker111/jgengine): a client backend + resolver over `@jgengine/core`, plus a `/server` entry point that ships the entire authoritative backend as factories.

## Client

`resolveConvexMultiplayer` resolves a `MultiplayerSession` when a game's `multiplayer` adapter is `convex(...)` (or `force`), wrapping `createConvexBackend`:

```ts
import { resolveConvexMultiplayer } from "@jgengine/convex/resolveConvexMultiplayer";

const session = resolveConvexMultiplayer({
  game: myGame,
  gameId: "my-game",
  url: import.meta.env.VITE_CONVEX_URL,
  force: import.meta.env.VITE_CONVEX_URL !== undefined,
});

<GamePlayerShell playable={playable} multiplayer={session} />;
```

`resolveShellMultiplayer` (`@jgengine/shell/multiplayer`) is the ws counterpart — a dev host can try both in sequence (`resolveConvexMultiplayer(...) ?? resolveShellMultiplayer(...)`, see `apps/dev/src/main.tsx`) and pass whichever resolves to the shell.

Once a session resolves, `GamePlayerShell` wires it up with no game code changes: pose presence (`RemotePlayers`), `feedActions` (default `entity.died`) bridged both ways with echo suppression, and `global`-kind chat channels relayed through `chatSyncFor` (`whisper`/`party`/`proximity` stay local). Everything else in `GameContext` stays client-local unless the game also registers a server-side `GameRuntime`.

## Server

`@jgengine/convex/server` exports factories, not a template to copy: `jgengineTables()`, `createGameServerFunctions({ runtimes?, auth? })`, `createLeaderboardFunctions({ auth? })`, `createPresenceFunctions({ auth?, freshWindowMs? })`, `createChatFunctions({ auth?, historyLimit?, maxBodyLength?, minIntervalMs? })`, and `jgengineCronSpecs()`. A consumer's `convex/` directory is ~25 lines total:

```ts
// convex/schema.ts
import { defineSchema } from "convex/server";
import { jgengineTables } from "@jgengine/convex/server";
export default defineSchema({ ...jgengineTables() });

// convex/runtime.ts, leaderboard.ts, presence.ts, chat.ts — one factory call each
import { createGameServerFunctions } from "@jgengine/convex/server";
export const { joinServer, leaveServer, runCommand, flushSave, getServer, getPlayerProfile, getFeed, pushFeedEntry, listOpenServers, tickActiveServers, flushDirtyServers } = createGameServerFunctions();

// convex/crons.ts registers tickActiveServers (1s) + flushDirtyServers (60s)
```

No game-specific code lives there — any JGengine game can point at the same deployment. Games without a registered `GameRuntime` fall back to a no-save runtime that only understands `engine.ping`; pass `createGameServerFunctions({ runtimes: [createGameRuntime({ gameId, commands, loop, save })] })` to make `runCommand`/tick/save actually do something.

Every factory defaults to `auth: "anonymous"` — the client's `externalId` is trusted as claimed, fine for local dev but spoofable. Pass `{ auth: "required" }` to every factory for production; the resolved actor becomes `ctx.auth.getUserIdentity()`'s `subject`, and `externalId` is only cross-checked against it, never trusted alone.

See `examples/convex-host` for the reference thin consumer (`bunx convex dev` codegens `convex/_generated/` and prints the dev URL). Point any game that declares `multiplayer: convex({ topology: "shared" })` at the same deployment. No Convex Cloud account is needed — `examples/convex-host/docker-compose.yml` runs the open-source backend anywhere Docker runs, with `CONVEX_SELF_HOSTED_URL`/`CONVEX_SELF_HOSTED_ADMIN_KEY` pointing the same CLI at it.

Part of [JGengine](https://github.com/Noisemaker111/jgengine). Apache-2.0.
