import { expect, test } from "bun:test";

import {
  buildHydratePlayers,
  drainPendingLeaderboardIncrements,
  LEADERBOARD_PENDING_KEY,
  planServerPersist,
  shouldAutoSave,
  toServerListing,
  trimFeedEntries,
  type GameServerRecord,
} from "./hostPersistence";
import { createEmptyServerRow, createRuntimeSnapshot } from "./snapshot";

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
    revision: 0,
    tickAnchorMs: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

test("drainPendingLeaderboardIncrements removes key and filters malformed entries", () => {
  const session = {
    keep: true,
    [LEADERBOARD_PENDING_KEY]: [
      { userId: "alice", stat: "kills", scope: "global", by: 2 },
      { userId: 42, stat: "kills", scope: "global", by: 1 },
    ],
  };
  const drained = drainPendingLeaderboardIncrements(session);
  expect(drained.increments).toEqual([{ userId: "alice", stat: "kills", scope: "global", by: 2 }]);
  expect(drained.session).toEqual({ keep: true });
  expect(session[LEADERBOARD_PENDING_KEY]).toHaveLength(2);
});

test("trimFeedEntries keeps the newest entries", () => {
  const entries = Array.from({ length: 25 }, (_value, index) => index);
  expect(trimFeedEntries(entries)).toEqual(entries.slice(5));
  expect(trimFeedEntries([1, 2], 5)).toEqual([1, 2]);
});

test("toServerListing omits joinCode unless explicitly included", () => {
  const record = makeServer({ joinCode: "SECRET1", visibility: "private" });
  expect(toServerListing(record).joinCode).toBeUndefined();
  expect(toServerListing(record, { includeJoinCode: true }).joinCode).toBe("SECRET1");
});

test("shouldAutoSave requires enabled save, dirt, and elapsed interval", () => {
  const save = { auto: "5s", scope: "player" } as const;
  expect(shouldAutoSave("none", 100, 0, 10_000)).toBe(false);
  expect(shouldAutoSave(save, undefined, 0, 10_000)).toBe(false);
  expect(shouldAutoSave(save, 100, 8_000, 10_000)).toBe(false);
  expect(shouldAutoSave(save, 100, 4_000, 10_000)).toBe(true);
  expect(shouldAutoSave(save, 100, undefined, 4_999)).toBe(false);
  expect(shouldAutoSave(save, 100, undefined, 5_000)).toBe(true);
});

test("buildHydratePlayers prefers profile state with session overlay", () => {
  const server = makeServer({
    memberUserIds: ["alice", "bob", "carol"],
    sessionPlayers: {
      alice: {
        userId: "alice",
        inventories: {},
        economy: { gold: 999 },
        unlocks: [],
        session: { combat: true },
      },
      bob: {
        userId: "bob",
        inventories: {},
        economy: { gold: 5 },
        unlocks: ["axe"],
        session: {},
      },
    },
  });
  const players = buildHydratePlayers(server, {
    alice: {
      userId: "alice",
      gameId: "demo",
      playerState: { userId: "alice", inventories: {}, economy: { gold: 10 }, unlocks: [], session: {} },
      revision: 3,
      updatedAt: 0,
    },
  });

  expect(players.alice?.economy.gold).toBe(10);
  expect(players.alice?.session).toEqual({ combat: true });
  expect(players.bob?.unlocks).toEqual(["axe"]);
  expect(players.carol).toEqual({ userId: "carol", inventories: {}, economy: {}, unlocks: [], session: {} });
});

test("planServerPersist drains leaderboard, splits sessions, and gates writes by save scope", () => {
  const server = makeServer();
  const base = createRuntimeSnapshot({ gameId: "demo", serverId: "srv-1" });
  const snapshot = {
    ...base,
    revision: 7,
    server: {
      ...base.server,
      session: {
        [LEADERBOARD_PENDING_KEY]: [{ userId: "alice", stat: "kills", scope: "server", by: 1 }],
      },
    },
    players: {
      alice: {
        userId: "alice",
        inventories: {},
        economy: { gold: 3 },
        unlocks: [],
        session: { casting: "frostbolt" },
      },
    },
    chunks: {
      "0,0": { chunkKey: "0,0", objects: [], entities: [] },
    },
    dirty: { server: true, players: ["alice"], chunks: ["0,0"] },
  };

  const plan = planServerPersist(server, snapshot, server.save, 1_000);

  expect(plan.leaderboard).toEqual([
    { userId: "alice", stat: "kills", scope: "server", serverId: "srv-1", by: 1 },
  ]);
  expect(plan.server.serverState.session).toEqual({});
  expect(plan.server.revision).toBe(7);
  expect(plan.server.dirtyAt).toBe(1_000);
  expect(plan.server.lastSavedAt).toBe(1_000);
  expect(plan.server.sessionPlayers.alice?.session).toEqual({ casting: "frostbolt" });
  expect(plan.profiles).toHaveLength(1);
  expect(plan.profiles[0]?.playerState.session).toEqual({});
  expect(plan.chunks.map((chunk) => chunk.chunkKey)).toEqual(["0,0"]);
  expect(plan.deletedChunks).toEqual([]);

  const noSave = planServerPersist(server, snapshot, "none", 1_000);
  expect(noSave.profiles).toHaveLength(0);
  expect(noSave.chunks).toHaveLength(0);
});

test("planServerPersist records dirty chunks with no snapshot as deletions", () => {
  const server = makeServer();
  const base = createRuntimeSnapshot({ gameId: "demo", serverId: "srv-1" });
  const snapshot = {
    ...base,
    revision: 2,
    chunks: { "0,0": { chunkKey: "0,0", objects: [], entities: [] } },
    dirty: { server: false, players: [], chunks: ["0,0", "1,0"] },
  };
  const plan = planServerPersist(server, snapshot, server.save, 1_000);
  expect(plan.chunks.map((chunk) => chunk.chunkKey)).toEqual(["0,0"]);
  expect(plan.deletedChunks).toEqual(["1,0"]);
});

test("planServerPersist keeps prior dirtyAt when snapshot is clean", () => {
  const server = makeServer({ dirtyAt: 42 });
  const snapshot = createRuntimeSnapshot({ gameId: "demo", serverId: "srv-1" });
  const plan = planServerPersist(server, snapshot, server.save, 1_000);
  expect(plan.server.dirtyAt).toBe(42);
});
