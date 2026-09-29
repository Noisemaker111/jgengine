# Flagship hosted multiplayer path

End-to-end recipe using a **real tracked game** — not a missing gallery id.

## Reference game

| | |
| --- | --- |
| Game | **`lantern-reach`** (`Games/lantern-reach`) |
| Adapter | `multiplayer: ws({ authority: "server" })` in `game.config.ts` |
| Play local | `bun run games:lantern-reach` |
| Dev multi-game host | `bun run dev:runner` → open `?game=lantern-reach` |

Server-authority means the host owns the sim; the shell mirrors world state (see `jgengine-multiplayer` → Authority).

## Node / Express + WS host

```sh
# terminal 1 — authoritative host
bun examples/express-host/src/server.ts
# ws://localhost:8080/ws  ·  GET /healthz

# terminal 2 — client
VITE_JG_WS_URL=ws://localhost:8080/ws bun run games:lantern-reach
# or: bun run dev:runner  →  http://localhost:5173/?game=lantern-reach
```

LAN: `multiplayer: lan()` derives `ws://<page-host>:8080/ws` automatically when the express host is on the same machine network. Deploy notes: `examples/express-host/DEPLOY.md`.

## Convex host

```sh
cd examples/convex-host
bun install
bunx convex dev          # prints VITE_CONVEX_URL-compatible deployment URL
# optional self-host: docker compose up -d  (see README)
```

Point a game at Convex with `multiplayer: convex({ topology: "shared", authority: "server" })` and `VITE_CONVEX_URL=…`. The factories under `examples/convex-host/convex/` are game-agnostic — register a `GameRuntime` only when you need server commands/ticks beyond presence.

## Checklist

1. Game declares adapter + authority (not missing `voxel-mine`-style ids).
2. Host process running (express or Convex).
3. Client env URL matches host.
4. Verify with two browsers / two userIds joining the same session.
