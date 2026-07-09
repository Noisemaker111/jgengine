import { createServer } from "node:http";

import express from "express";

import type { GameRuntime } from "@jgengine/core/runtime/gameRuntime";
import type { HostPersistence } from "@jgengine/core/runtime/hostPersistence";
import { createGameHost } from "@jgengine/node/host";
import { filePersistence, memoryPersistence } from "@jgengine/node/persistence";
import { toNodeHandler } from "@jgengine/node/webHandler";
import { createGameWsServer } from "@jgengine/node/wsServer";
import { ensureSchema, sqlPersistence, type SqlPool } from "@jgengine/sql/sqlPersistence";
import { createReadsHandler } from "@jgengine/ws/readsHandler";

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
  console.warn(
    "persistence: memory — NON-PERSISTENT, all data is lost on restart. Set DATABASE_URL or DATA_DIR to persist.",
  );
  return memoryPersistence();
}

const persistence = await persistenceFromEnv();
const host = createGameHost({ runtimes: GAME_RUNTIMES, persistence });
host.start();

const app = express();

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

const reads = createReadsHandler({ persistence, listOpenServers: host.listOpenServers });
app.get("/api/*splat", toNodeHandler(reads));

const server = createServer(app);
const wsServer = createGameWsServer({ host, server, path: "/ws" });

const port = Number(process.env.PORT ?? 8080);
server.listen(port, () => {
  console.log(`jgengine host listening on :${port} (game socket at /ws)`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void (async () => {
      try {
        await wsServer.close();
        await host.stop();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        process.exit(0);
      } catch (error) {
        console.error("shutdown failed:", error);
        process.exit(1);
      }
    })();
  });
}
