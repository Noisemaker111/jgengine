import { expect, test } from "bun:test";
import { newDb } from "pg-mem";

import type { GameServerRecord } from "@jgengine/core/runtime/hostPersistence";
import { createEmptyServerRow } from "@jgengine/core/runtime/snapshot";

import { ensureSchema, sqlPersistence, type SqlPool } from "./sqlPersistence";

async function makePersistence(now: () => number = () => 1_000) {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool() as unknown as SqlPool;
  await ensureSchema(pool);
  return sqlPersistence(pool, now);
}

function makeServer(overrides: Partial<GameServerRecord> = {}): GameServerRecord {
  return {
    serverId: "srv-1",
    gameId: "demo",
    status: "running",
    memberUserIds: ["alice"],
    slotsPerServer: 16,
    save: { auto: "5s", scope: "player+chunks" },
    serverState: createEmptyServerRow(),
    sessionPlayers: {},
    revision: 1,
    tickAnchorMs: 0,
    createdAt: 0,
    updatedAt: 10,
    ...overrides,
  };
}

test("server records round-trip and list by game", async () => {
  const persistence = await makePersistence();
  expect(await persistence.loadServer("srv-1")).toBeNull();

  const record = makeServer();
  await persistence.saveServer(record);
  expect(await persistence.loadServer("srv-1")).toEqual(record);

  await persistence.saveServer({ ...record, revision: 2, status: "open" });
  const updated = await persistence.loadServer("srv-1");
  expect(updated?.revision).toBe(2);
  expect(updated?.status).toBe("open");

  await persistence.saveServer(makeServer({ serverId: "srv-2", gameId: "other" }));
  expect((await persistence.listServers("demo")).map((row) => row.serverId)).toEqual(["srv-1"]);
});

test("profiles and chunks round-trip", async () => {
  const persistence = await makePersistence();
  expect(await persistence.loadProfile({ userId: "alice", gameId: "demo" })).toBeNull();

  const profile = {
    userId: "alice",
    gameId: "demo",
    playerState: { userId: "alice", inventories: {}, economy: { gold: 5 }, unlocks: [], session: {} },
    revision: 3,
    updatedAt: 20,
  };
  await persistence.saveProfile(profile);
  expect(await persistence.loadProfile({ userId: "alice", gameId: "demo" })).toEqual(profile);
  await persistence.saveProfile({ ...profile, revision: 4 });
  expect((await persistence.loadProfile({ userId: "alice", gameId: "demo" }))?.revision).toBe(4);

  const chunk = { serverId: "srv-1", chunkKey: "0,0", snapshot: { chunkKey: "0,0", objects: [], entities: [] }, updatedAt: 30 };
  await persistence.saveChunks("srv-1", [chunk]);
  expect(await persistence.loadChunks("srv-1")).toEqual([chunk]);
});

test("feed buffers append and trim to the ring limit", async () => {
  const persistence = await makePersistence();
  for (let index = 0; index < 25; index += 1) {
    await persistence.appendFeed({ serverId: "srv-1", action: "kill", entry: { index } });
  }
  const entries = await persistence.loadFeed({ serverId: "srv-1", action: "kill" });
  expect(entries).toHaveLength(20);
  expect(entries[0]).toEqual({ index: 5 });
  expect(entries[19]).toEqual({ index: 24 });
});

test("leaderboard increments accumulate, order, and filter by server", async () => {
  const persistence = await makePersistence();
  await persistence.applyLeaderboardIncrements("demo", [
    { userId: "alice", stat: "kills", scope: "global", by: 3 },
    { userId: "bob", stat: "kills", scope: "global", by: 5 },
    { userId: "alice", stat: "kills", scope: "global", by: 4 },
    { userId: "alice", stat: "kills", scope: "server", serverId: "srv-1", by: 1 },
    { userId: "alice", stat: "gold", scope: "profile", by: 9 },
  ]);

  expect(await persistence.getLeaderboardTop({ gameId: "demo", stat: "kills", scope: "global" })).toEqual([
    { userId: "alice", value: 7 },
    { userId: "bob", value: 5 },
  ]);
  expect(
    await persistence.getLeaderboardTop({ gameId: "demo", stat: "kills", scope: "global", limit: 1 }),
  ).toEqual([{ userId: "alice", value: 7 }]);
  expect(
    await persistence.getLeaderboardTop({ gameId: "demo", stat: "kills", scope: "server", serverId: "srv-1" }),
  ).toEqual([{ userId: "alice", value: 1 }]);
  expect(await persistence.getLeaderboardProfile({ gameId: "demo", userId: "alice" })).toEqual({ gold: 9 });
});

test("resetScenario wipes run scope while account meta persists", async () => {
  const persistence = await makePersistence();
  await persistence.saveServer(makeServer());
  await persistence.saveChunks("srv-1", [
    { serverId: "srv-1", chunkKey: "0,0", snapshot: { chunkKey: "0,0", objects: [], entities: [] }, updatedAt: 30 },
  ]);
  await persistence.saveProfile({
    userId: "alice",
    gameId: "demo",
    playerState: {
      userId: "alice",
      inventories: { bag: [{ item: "run_loot", count: 3 }] },
      economy: { meta_shards: 40 },
      unlocks: ["talent_forge"],
      session: {},
    },
    revision: 2,
    updatedAt: 20,
  });

  await persistence.resetScenario?.({
    gameId: "demo",
    serverId: "srv-1",
    wipeChunks: true,
    wipeServerSession: true,
    resetPlayers: "run",
    runFields: ["inventories"],
  });

  expect(await persistence.loadServer("srv-1")).toBeNull();
  expect(await persistence.loadChunks("srv-1")).toEqual([]);
  const profile = await persistence.loadProfile({ userId: "alice", gameId: "demo" });
  expect(profile?.playerState.inventories).toEqual({});
  expect(profile?.playerState.economy).toEqual({ meta_shards: 40 });
  expect(profile?.playerState.unlocks).toEqual(["talent_forge"]);
  expect(profile?.revision).toBe(3);
});

test("savePlan applies leaderboard, profiles, chunks, and server atomically", async () => {
  const persistence = await makePersistence();
  const server = makeServer();
  await persistence.savePlan?.({
    server,
    profiles: [
      {
        userId: "alice",
        gameId: "demo",
        playerState: { userId: "alice", inventories: {}, economy: { gold: 2 }, unlocks: [], session: {} },
        revision: 1,
        updatedAt: 10,
      },
    ],
    chunks: [
      { serverId: "srv-1", chunkKey: "0,0", snapshot: { chunkKey: "0,0", objects: [], entities: [] }, updatedAt: 10 },
    ],
    deletedChunks: [],
    leaderboard: [{ userId: "alice", stat: "gold", scope: "profile", by: 2 }],
  });

  expect(await persistence.loadServer("srv-1")).toEqual(server);
  expect((await persistence.loadProfile({ userId: "alice", gameId: "demo" }))?.revision).toBe(1);
  expect(await persistence.loadChunks("srv-1")).toHaveLength(1);
  expect(await persistence.getLeaderboardProfile({ gameId: "demo", userId: "alice" })).toEqual({ gold: 2 });
});

test("savePlan removes chunks named in deletedChunks", async () => {
  const persistence = await makePersistence();
  await persistence.saveChunks("srv-1", [
    { serverId: "srv-1", chunkKey: "0,0", snapshot: { chunkKey: "0,0", objects: [], entities: [] }, updatedAt: 10 },
    { serverId: "srv-1", chunkKey: "1,0", snapshot: { chunkKey: "1,0", objects: [], entities: [] }, updatedAt: 10 },
  ]);

  await persistence.savePlan?.({
    server: makeServer(),
    profiles: [],
    chunks: [],
    deletedChunks: ["0,0"],
    leaderboard: [],
  });

  expect((await persistence.loadChunks("srv-1")).map((chunk) => chunk.chunkKey)).toEqual(["1,0"]);
});

test("getLeaderboardTop ignores non-finite limits", async () => {
  const persistence = await makePersistence();
  await persistence.applyLeaderboardIncrements("demo", [
    { userId: "alice", stat: "kills", scope: "global", by: 3 },
  ]);
  expect(
    await persistence.getLeaderboardTop({ gameId: "demo", stat: "kills", scope: "global", limit: Number.NaN }),
  ).toEqual([{ userId: "alice", value: 3 }]);
});

test("resetScenario clears feeds and leaderboard rows for the server", async () => {
  const persistence = await makePersistence();
  await persistence.saveServer(makeServer());
  await persistence.appendFeed({ serverId: "srv-1", action: "kill", entry: { index: 1 } });
  await persistence.applyLeaderboardIncrements("demo", [
    { userId: "alice", stat: "kills", scope: "server", serverId: "srv-1", by: 4 },
  ]);

  await persistence.resetScenario?.({
    gameId: "demo",
    serverId: "srv-1",
    wipeChunks: true,
    wipeServerSession: true,
    resetPlayers: "none",
    runFields: [],
  });

  expect(await persistence.loadFeed({ serverId: "srv-1", action: "kill" })).toEqual([]);
  expect(
    await persistence.getLeaderboardTop({ gameId: "demo", stat: "kills", scope: "server", serverId: "srv-1" }),
  ).toEqual([]);
});
