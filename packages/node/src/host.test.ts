import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RuntimePlayerRow } from "@jgengine/core/runtime/snapshot";

import { createGameHost } from "./host";
import { clearFilePersistence, filePersistence, memoryPersistence } from "./persistence";
import { createChunkTestRuntime, createTestRuntime } from "./testFixtures";

test("join, command, flush, and restart round-trip through memory persistence", async () => {
  let t = 0;
  const persistence = memoryPersistence(() => t);
  const host = createGameHost({
    runtimes: [createTestRuntime()],
    persistence,
    now: () => t,
    tickMs: 10,
  });

  const joined = await host.joinServer({ userId: "alice", gameId: "test-game" });
  expect(joined.isNew).toBe(true);

  const rejoined = await host.joinServer({
    userId: "alice",
    gameId: "test-game",
    serverId: joined.serverId,
  });
  expect(rejoined).toEqual({ serverId: joined.serverId, isNew: false });

  const granted = await host.runCommand({
    userId: "alice",
    serverId: joined.serverId,
    command: "gold.grant",
    input: { userId: "alice", amount: 5 },
  });
  expect(granted).toEqual({ ok: true });

  const denied = await host.runCommand({
    userId: "mallory",
    serverId: joined.serverId,
    command: "gold.grant",
    input: { userId: "mallory", amount: 5 },
  });
  expect(denied).toEqual({ ok: false, reason: "Not a member of this server" });

  const invalid = await host.runCommand({
    userId: "alice",
    serverId: joined.serverId,
    command: "gold.grant",
    input: { amount: "lots" },
  });
  expect(invalid.ok).toBe(false);

  const playerView = await host.getPlayerView({ userId: "alice", serverId: joined.serverId });
  expect((playerView?.playerState as RuntimePlayerRow).economy.gold).toBe(5);

  t = 100;
  expect(await host.flushAll()).toBe(1);

  const profile = await persistence.loadProfile({ userId: "alice", gameId: "test-game" });
  expect(profile?.playerState.economy.gold).toBe(5);
  expect(
    await persistence.getLeaderboardTop({ gameId: "test-game", stat: "gold", scope: "profile" }),
  ).toEqual([{ userId: "alice", value: 5 }]);

  const restarted = createGameHost({ runtimes: [createTestRuntime()], persistence, now: () => t });
  const afterRestart = await restarted.joinServer({
    userId: "alice",
    gameId: "test-game",
    serverId: joined.serverId,
  });
  expect(afterRestart).toEqual({ serverId: joined.serverId, isNew: false });
  const restoredView = await restarted.getPlayerView({ userId: "alice", serverId: joined.serverId });
  expect((restoredView?.playerState as RuntimePlayerRow).economy.gold).toBe(5);
});

test("tick advances the loop and auto-saves on the save cadence", async () => {
  let t = 0;
  const persistence = memoryPersistence(() => t);
  const host = createGameHost({
    runtimes: [createTestRuntime()],
    persistence,
    now: () => t,
    tickMs: 10,
  });

  const { serverId } = await host.joinServer({ userId: "alice", gameId: "test-game" });

  t = 5;
  expect(await host.tickOnce()).toEqual({ ticked: 0, saved: 0 });

  t = 20;
  expect(await host.tickOnce()).toEqual({ ticked: 1, saved: 1 });

  const stored = await persistence.loadServer(serverId);
  expect(stored?.serverState.session.uptime).toBeCloseTo(0.02);
  expect(stored?.lastSavedAt).toBe(20);
});

test("leave persists, frees the slot, and hides the server from the browser list", async () => {
  const t = 0;
  const persistence = memoryPersistence(() => t);
  const host = createGameHost({
    runtimes: [createTestRuntime()],
    persistence,
    now: () => t,
    slotsPerServer: 1,
  });

  const { serverId } = await host.joinServer({ userId: "alice", gameId: "test-game" });
  await expect(
    host.joinServer({ userId: "bob", gameId: "test-game", serverId }),
  ).rejects.toThrow("Server is full");

  expect(await host.listOpenServers({ gameId: "test-game" })).toHaveLength(1);

  await host.runCommand({
    userId: "alice",
    serverId,
    command: "gold.grant",
    input: { userId: "alice", amount: 3 },
  });
  await host.leaveServer({ userId: "alice", serverId });

  const stored = await persistence.loadServer(serverId);
  expect(stored?.memberUserIds).toEqual([]);
  expect(stored?.status).toBe("open");
  expect(await host.listOpenServers({ gameId: "test-game" })).toHaveLength(0);

  const profile = await persistence.loadProfile({ userId: "alice", gameId: "test-game" });
  expect(profile?.playerState.economy.gold).toBe(3);
});

test("feed buffers append, trim, and gate on membership", async () => {
  const persistence = memoryPersistence();
  const host = createGameHost({
    runtimes: [createTestRuntime()],
    persistence,
    allowedFeedActions: ["kill"],
  });

  const { serverId } = await host.joinServer({ userId: "alice", gameId: "test-game" });
  for (let index = 0; index < 25; index += 1) {
    await host.pushFeedEntry({ userId: "alice", serverId, action: "kill", entry: { index } });
  }
  const feed = await host.getFeed({ userId: "alice", serverId, action: "kill" });
  expect(feed).toHaveLength(20);
  expect(feed[19]).toEqual({ index: 24 });
  expect(await host.getFeed({ userId: "mallory", serverId, action: "kill" })).toEqual([]);
  await expect(
    host.pushFeedEntry({ userId: "mallory", serverId, action: "kill", entry: {} }),
  ).rejects.toThrow("Not a member of this server");
});

test("filePersistence round-trips every tier and survives a host restart", async () => {
  const dir = join(tmpdir(), `jg-node-test-${process.pid}-${Math.random().toString(36).slice(2)}`);
  try {
    let t = 0;
    const persistence = filePersistence(dir, () => t);
    const host = createGameHost({
      runtimes: [createTestRuntime()],
      persistence,
      now: () => t,
      allowedFeedActions: ["kill"],
    });

    const { serverId } = await host.joinServer({ userId: "alice", gameId: "test-game" });
    await host.runCommand({
      userId: "alice",
      serverId,
      command: "gold.grant",
      input: { userId: "alice", amount: 8 },
    });
    await host.pushFeedEntry({ userId: "alice", serverId, action: "kill", entry: { boss: "onyxia" } });
    t = 100;
    await host.stop();

    const reopened = filePersistence(dir, () => t);
    expect((await reopened.listServers("test-game")).map((record) => record.serverId)).toEqual([serverId]);
    expect(await reopened.loadFeed({ serverId, action: "kill" })).toEqual([{ boss: "onyxia" }]);
    expect(
      await reopened.getLeaderboardTop({ gameId: "test-game", stat: "gold", scope: "profile" }),
    ).toEqual([{ userId: "alice", value: 8 }]);
    expect(await reopened.getLeaderboardProfile({ gameId: "test-game", userId: "alice" })).toEqual({
      gold: 8,
    });

    const restarted = createGameHost({ runtimes: [createTestRuntime()], persistence: reopened, now: () => t });
    const rejoined = await restarted.joinServer({ userId: "alice", gameId: "test-game", serverId });
    expect(rejoined.isNew).toBe(false);
    const view = await restarted.getPlayerView({ userId: "alice", serverId });
    expect((view?.playerState as RuntimePlayerRow).economy.gold).toBe(8);
  } finally {
    await clearFilePersistence(dir);
  }
});

test("memory deleteChunks drops keys permanently", async () => {
  const persistence = memoryPersistence();
  await persistence.saveChunks("srv-1", [
    { serverId: "srv-1", chunkKey: "0,0", snapshot: { chunkKey: "0,0", objects: [], entities: [] }, updatedAt: 1 },
    { serverId: "srv-1", chunkKey: "1,0", snapshot: { chunkKey: "1,0", objects: [], entities: [] }, updatedAt: 1 },
  ]);
  await persistence.deleteChunks("srv-1", ["0,0"]);
  expect((await persistence.loadChunks("srv-1")).map((chunk) => chunk.chunkKey)).toEqual(["1,0"]);
});

test("file deleteChunks drops keys permanently across reopen", async () => {
  const dir = join(tmpdir(), `jg-node-chunks-${process.pid}-${Math.random().toString(36).slice(2)}`);
  try {
    const persistence = filePersistence(dir);
    await persistence.saveChunks("srv-1", [
      { serverId: "srv-1", chunkKey: "0,0", snapshot: { chunkKey: "0,0", objects: [], entities: [] }, updatedAt: 1 },
      { serverId: "srv-1", chunkKey: "1,0", snapshot: { chunkKey: "1,0", objects: [], entities: [] }, updatedAt: 1 },
    ]);
    await persistence.deleteChunks("srv-1", ["0,0"]);
    expect((await persistence.loadChunks("srv-1")).map((chunk) => chunk.chunkKey)).toEqual(["1,0"]);

    const reopened = filePersistence(dir);
    expect((await reopened.loadChunks("srv-1")).map((chunk) => chunk.chunkKey)).toEqual(["1,0"]);
  } finally {
    await clearFilePersistence(dir);
  }
});

test("filePersistence sanitizes a \"..\" key so it cannot escape the base dir", async () => {
  const dir = join(tmpdir(), `jg-node-traversal-${process.pid}-${Math.random().toString(36).slice(2)}`);
  try {
    const persistence = filePersistence(dir);
    await persistence.applyLeaderboardIncrements("test-game", [
      { userId: "alice", stat: "gold", scope: "profile", by: 8 },
    ]);
    const leaderboardBefore = await readFile(join(dir, "leaderboard.json"), "utf8");

    await persistence.saveChunks("..", [
      { serverId: "..", chunkKey: "leaderboard", snapshot: { chunkKey: "leaderboard", objects: [], entities: [] }, updatedAt: 1 },
    ]);

    const leaderboardAfter = await readFile(join(dir, "leaderboard.json"), "utf8");
    expect(leaderboardAfter).toBe(leaderboardBefore);
    expect((await persistence.loadChunks("..")).map((chunk) => chunk.chunkKey)).toEqual(["leaderboard"]);
  } finally {
    await clearFilePersistence(dir);
  }
});

test("host flush applies deletedChunks through memory persistence", async () => {
  let t = 0;
  const persistence = memoryPersistence(() => t);
  const host = createGameHost({
    runtimes: [createChunkTestRuntime()],
    persistence,
    now: () => t,
  });

  const { serverId } = await host.joinServer({ userId: "alice", gameId: "chunk-game" });
  await host.runCommand({
    userId: "alice",
    serverId,
    command: "chunk.put",
    input: { chunkKey: "0,0" },
  });
  await host.runCommand({
    userId: "alice",
    serverId,
    command: "chunk.put",
    input: { chunkKey: "1,0" },
  });
  t = 100;
  expect(await host.flushAll()).toBe(1);
  expect((await persistence.loadChunks(serverId)).map((chunk) => chunk.chunkKey).sort()).toEqual([
    "0,0",
    "1,0",
  ]);

  await host.runCommand({
    userId: "alice",
    serverId,
    command: "chunk.delete",
    input: { chunkKey: "0,0" },
  });
  t = 200;
  expect(await host.flushAll()).toBe(1);
  expect((await persistence.loadChunks(serverId)).map((chunk) => chunk.chunkKey)).toEqual(["1,0"]);

  const restarted = createGameHost({
    runtimes: [createChunkTestRuntime()],
    persistence,
    now: () => t,
  });
  await restarted.joinServer({ userId: "alice", gameId: "chunk-game", serverId });
  expect((await persistence.loadChunks(serverId)).map((chunk) => chunk.chunkKey)).toEqual(["1,0"]);
});
