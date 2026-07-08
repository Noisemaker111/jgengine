# JGengine next-host

Next.js is the **client + reads** host. It renders the game shell in a client component
(`/play`) and serves the plain-fetch read surface (`/api/*`) from route handlers hitting the
shared Postgres via `@jgengine/sql`.

**The authoritative WebSocket host stays a standalone process** (`examples/express-host` or any
`createGameHost` embedding). Next's serverless model cannot own a stateful tick loop — do not
try to run `createGameWsServer` inside a route handler.

```sh
bun install
DATABASE_URL=postgres://... bunx next dev        # from examples/next-host
DATABASE_URL=postgres://... bun run build:next   # production build
```

## The surface

Reads are a one-line catch-all route (`app/api/[...reads]/route.ts`):

```ts
import { createReadsHandler } from "@jgengine/ws/readsHandler";
import { createPersistence } from "../../../lib/persistence";

export const GET = createReadsHandler({ persistence: createPersistence });
```

The client mount is one component (`components/GameClient.tsx`):

```tsx
<GamePlayer gameId={...} registry={gameRegistry} fallbackGameId="demo" loading={...} />
```

`createReadsHandler` serves `/api/servers`, `/api/leaderboard/:stat`,
`/api/leaderboard-profile/:userId`, `/api/profile/:userId` — all take `?gameId=&limit=`.
These match `createHttpReads({ baseUrl, gameId })` from `@jgengine/ws/httpReads` exactly,
because both read the same `@jgengine/ws/readsHandler` route table.
