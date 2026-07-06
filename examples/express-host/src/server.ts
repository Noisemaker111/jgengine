import { createServer } from "node:http";

import express from "express";

import type { LeaderboardScope } from "@jgengine/core/game/leaderboard";
import type { GameRuntime } from "@jgengine/core/runtime/gameRuntime";
import type { HostPersistence } from "@jgengine/core/runtime/hostPersistence";
import { createGameHost } from "@jgengine/node/host";
import { filePersistence, memoryPersistence } from "@jgengine/node/persistence";
import { createGameWsServer } from "@jgengine/node/wsServer";
import { ensureSchema, sqlPersistence, type SqlPool } from "@jgengine/sql/sqlPersistence";

const GAME_RUNTIMES: GameRuntime[] = [];

async function persistenceFromEnv(): Promise<HostPersistence> {
  if (process.env.DATABASE_URL) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL }) as unknown as SqlPool;
    await ensureSchema(pool);
    console.log("persistence: postgres");
    return sqlPersistence(pool);
  }
  if (process.env.DATA_DIR) {
    console.log(`persistence: file (${process.env.DATA_DIR})`);
    return filePersistence(process.env.DATA_DIR);
  }
  console.log("persistence: memory (set DATABASE_URL or DATA_DIR to persist)");
  return memoryPersistence();
}

function isScope(value: string): value is LeaderboardScope {
  return value === "global" || value === "server" || value === "profile";
}

const persistence = await persistenceFromEnv();
const host = createGameHost({ runtimes: GAME_RUNTIMES, persistence });
host.start();

const app = express();

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/servers", async (req, res) => {
  const gameId = String(req.query.gameId ?? "");
  const limit = req.query.limit === undefined ? undefined : Number(req.query.limit);
  res.json(await host.listOpenServers({ gameId, limit }));
});

app.get("/api/leaderboard/:stat", async (req, res) => {
  const scope = String(req.query.scope ?? "global");
  if (!isScope(scope)) {
    res.status(400).json({ error: "scope must be global | server | profile" });
    return;
  }
  res.json(
    await persistence.getLeaderboardTop({
      gameId: String(req.query.gameId ?? ""),
      stat: req.params.stat,
      scope,
      serverId: req.query.serverId === undefined ? undefined : String(req.query.serverId),
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    }),
  );
});

app.get("/api/leaderboard-profile/:userId", async (req, res) => {
  res.json(
    await persistence.getLeaderboardProfile({
      gameId: String(req.query.gameId ?? ""),
      userId: req.params.userId,
    }),
  );
});

app.get("/api/profile/:userId", async (req, res) => {
  const profile = await persistence.loadProfile({
    userId: req.params.userId,
    gameId: String(req.query.gameId ?? ""),
  });
  res.json(
    profile === null
      ? null
      : {
          userId: profile.userId,
          gameId: profile.gameId,
          playerState: profile.playerState,
          updatedAt: profile.updatedAt,
        },
  );
});

const server = createServer(app);
const wsServer = createGameWsServer({ host, server, path: "/ws" });

const port = Number(process.env.PORT ?? 8080);
server.listen(port, () => {
  console.log(`jgengine host listening on :${port} (game socket at /ws)`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void (async () => {
      await wsServer.close();
      await host.stop();
      server.close(() => process.exit(0));
    })();
  });
}
