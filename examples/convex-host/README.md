# convex-host

Server-side Convex functions that `@jgengine/convex`'s `createConvexBackend` talks to. The `convex/jgengine/` modules implement the runtime command loop, save-cadence persistence, leaderboards, and the game-runtime registry over five tables: `jgGameServers`, `jgPlayerProfiles`, `jgWorldChunks`, `jgLeaderboardRows`, `jgFeedBuffers` (see `convex/schema.ts`).

Setup:

```sh
bun install
bunx convex dev
```

`bunx convex dev` codegens `convex/_generated/` (which `jgengine/*.ts` imports for `server`/`dataModel` types) and deploys to your dev deployment. This package has no `check-types` script because it cannot typecheck until `_generated/` exists.

Register your game's runtime in `convex/jgengine/registry.ts` via `registerGameRuntime` — unregistered game ids fall back to a no-save runtime with only `engine.ping`. Auth: `convex/permissions.ts` resolves the acting user from `ctx.auth.getUserIdentity()`; wire any Convex-supported auth provider.
