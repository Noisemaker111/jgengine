# Deploying the JGengine express host to fly.io

Run everything from the repo root (the Docker build context is the monorepo).

## Local

```sh
bun install
bun examples/express-host/src/server.ts                      # memory persistence
DATA_DIR=/tmp/jg-data bun examples/express-host/src/server.ts   # file persistence
DATABASE_URL=postgres://... bun examples/express-host/src/server.ts  # postgres
```

Game socket: `ws://localhost:8080/ws` (`createWsBackend({ url, userId })`).
Reads: `GET /api/servers?gameId=...`, `GET /api/leaderboard/:stat?gameId=...&scope=global`,
`GET /api/leaderboard-profile/:userId?gameId=...`, `GET /api/profile/:userId?gameId=...`
(`createHttpReads({ baseUrl, gameId })` in `@jgengine/ws/httpReads`). Health: `GET /healthz`.

## LAN play

Play across machines on the same network with no cloud host at all:

```sh
bun examples/express-host/src/server.ts   # host process, ws://<your-ip>:8080/ws
bun run dev                               # apps/dev now listens on the network (server: { host: true })
```

Other machines on the LAN open `http://<your-ip>:5173/?game=<id>`. A game declaring `multiplayer: lan()`
(from `@jgengine/core/runtime/adapter`) derives its ws URL from the page it was served from — no config
needed, every LAN browser connects to `ws://<same-hostname>:8080/ws` automatically.

## Fly

```sh
fly launch --no-deploy --copy-config --config examples/express-host/fly.toml
fly postgres create --name jgengine-db
fly postgres attach jgengine-db --app jgengine-host        # sets DATABASE_URL secret
fly deploy --config examples/express-host/fly.toml
```

Schema is created on boot (`ensureSchema`), so no migration step is needed.

Once deployed, a game's client-side one-liner is `multiplayer: fly({ app: "your-app" })` (from
`@jgengine/core/runtime/adapter`) — it resolves to a `ws` adapter pointed at `wss://your-app.fly.dev/ws`,
no manual URL wiring.

## Scaling notes

One machine owns the authoritative tick loop; `min_machines_running = 1` keeps it warm and
websockets work natively on Fly. The `servers({ maxServers, slotsPerServer })` pool config maps
to machines when scaling out: run one Fly app (or region) per host process and use the
`GET /api/servers` listing as the server browser. Cross-machine matchmaking is intentionally
not built yet.
