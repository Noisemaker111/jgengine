# JGengine tanstack-host

TanStack Start is the **client + reads** host. It renders the game shell client-only
(`/play`, `ssr: false` + `ClientOnly` so three.js never loads during SSR) and serves the
plain-fetch read surface (`/api/*`) from a file-based server route hitting the shared Postgres
via `@jgengine/sql`. It proves the engine's "any framework in ~15 lines of glue" story —
compare `src/routes/api.$.ts` and `src/lib/persistence.ts` to their Next.js equivalents in
`examples/next-host`.

**The authoritative WebSocket host stays a standalone process** (`examples/express-host` or any
`createGameHost` embedding). A Vite/Nitro server route cannot own a stateful tick loop — do not
try to run `createGameWsServer` inside a server route.

## The two glue files

`src/routes/api.$.ts` — a splat server route (`server.handlers` on `createFileRoute`) that
forwards every request under `/api/*` to the engine's reads handler:

```ts
import { createFileRoute } from "@tanstack/react-router";
import { createReadsHandler } from "@jgengine/ws/readsHandler";
import { createPersistence } from "../lib/persistence";

const handleReads = createReadsHandler({ persistence: createPersistence });

export const Route = createFileRoute("/api/$")({
  server: { handlers: { GET: ({ request }) => handleReads(request) } },
});
```

`src/lib/persistence.ts` — a lazy async factory that opens the shared Postgres pool:

```ts
export async function createPersistence(): Promise<HostPersistence> {
  const url = process.env.DATABASE_URL;
  if (url === undefined) throw new Error("DATABASE_URL is required");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url }) as unknown as SqlPool;
  await ensureSchema(pool);
  return sqlPersistence(pool);
}
```

## Dev

```sh
bun install
DATABASE_URL=postgres://... bun run --cwd examples/tanstack-host dev     # http://localhost:3001
DATABASE_URL=postgres://... bun run --cwd examples/tanstack-host build   # production build
bun run --cwd examples/tanstack-host start                               # node .output/server/index.mjs
```

Reads match `createHttpReads({ baseUrl, gameId })` from `@jgengine/ws/httpReads`:
`/api/servers`, `/api/leaderboard/:stat`, `/api/leaderboard-profile/:userId`,
`/api/profile/:userId` — all take `?gameId=...`.

Set `VITE_GAME_ID` to switch the mounted game away from the `nonogram` default.
