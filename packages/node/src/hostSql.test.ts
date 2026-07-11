import { expect, test } from "bun:test";
import { newDb } from "pg-mem";

import type { RuntimePlayerRow } from "@jgengine/core/runtime/snapshot";
import { ensureSchema, sqlPersistence, type SqlPool } from "@jgengine/sql/sqlPersistence";

import { createGameHost } from "./host";
import { createTestRuntime } from "./testFixtures";

test("host runs against sql persistence and survives a restart", async () => {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool() as unknown as SqlPool;
  await ensureSchema(pool);

  let t = 0;
  const persistence = sqlPersistence(pool, () => t);
  const host = createGameHost({
    runtimes: [createTestRuntime()],
    persistence,
    now: () => t,
    allowedFeedActions: ["kill"],
  });

  const { serverId, isNew } = await host.joinServer({ userId: "alice", gameId: "test-game" });
  expect(isNew).toBe(true);
  await host.runCommand({
    userId: "alice",
    serverId,
    command: "gold.grant",
    input: { userId: "alice", amount: 12 },
  });
  await host.pushFeedEntry({ userId: "alice", serverId, action: "kill", entry: { boss: "ragnaros" } });
  t = 100;
  await host.stop();

  expect(
    await persistence.getLeaderboardTop({ gameId: "test-game", stat: "gold", scope: "profile" }),
  ).toEqual([{ userId: "alice", value: 12 }]);

  const restarted = createGameHost({
    runtimes: [createTestRuntime()],
    persistence,
    now: () => t,
    allowedFeedActions: ["kill"],
  });
  const rejoined = await restarted.joinServer({ userId: "alice", gameId: "test-game", serverId });
  expect(rejoined).toEqual({ serverId, isNew: false });
  const view = await restarted.getPlayerView({ userId: "alice", serverId });
  expect((view?.playerState as RuntimePlayerRow).economy.gold).toBe(12);
  expect(await restarted.getFeed({ userId: "alice", serverId, action: "kill" })).toEqual([
    { boss: "ragnaros" },
  ]);
});
