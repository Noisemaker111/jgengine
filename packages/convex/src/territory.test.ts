import { expect, test } from "bun:test";
import { claimTerritory } from "@jgengine/core/world/territory";
import { createEmptyPlayerRow } from "@jgengine/core/runtime/snapshot";
import { loadTerritoryState, persistTerritoryState } from "./territory";
import type { JGMutationCtx } from "./server";
import { makeDb, profileDoc, serverDoc } from "./testFixtures";

test("territory persistence reads only requested chunks and writes no shared-server row", async () => {
  const f = makeDb(), ctx = { db: f.db } as unknown as JGMutationCtx;
  f.seed("jgGameServers", serverDoc({ _id: "world" }));
  f.seed("jgPlayerProfiles", profileDoc({ userId: "alice", gameId: "demo", playerState: { ...createEmptyPlayerRow("alice"), economy: { cash: 100 } } }));
  f.seed("jgWorldChunks", { _id: "far", _creationTime: 0, serverId: "world", chunkKey: "90,90", snapshot: { chunkKey: "90,90", objects: [], entities: [] }, updatedAt: 0 });
  const snapshot = await loadTerritoryState(ctx, { serverId: "world", gameId: "demo", userId: "alice", chunkKeys: ["0,0"] });
  const result = claimTerritory(snapshot, "alice", [{ x: 1, z: 2 }], { currency: "cash", price: () => 25, nowMs: 100 });
  if (!result.ok) throw new Error(result.reason);
  await persistTerritoryState(ctx, result.snapshot, 100);
  expect(f.reads.has("far")).toBe(false);
  expect(f.reads.has("world")).toBe(false);
  const restored = await loadTerritoryState(ctx, { serverId: "world", gameId: "demo", userId: "alice", chunkKeys: ["0,0"] });
  expect(restored.players.alice!.economy.cash).toBe(75);
  expect(restored.players.alice!.territoryOwnedCount).toBe(1);
  expect(restored.players.alice!.ownedTerritoryChunkKeys).toEqual(["0,0"]);
  expect(restored.chunks["0,0"]!.territoryReceipts).toEqual({ "1,2": { claimedAt: 100, costPaid: 25 } });
  expect(f.rows("jgGameServers")[0]!.revision).toBe(0);
});
test("territory hydration rejects excessive chunk reads before touching storage", async () => {
  const f = makeDb(), ctx = { db: f.db } as unknown as JGMutationCtx;
  await expect(loadTerritoryState(ctx, { serverId: "world", gameId: "demo", userId: "alice", chunkKeys: Array.from({ length: 65 }, (_, i) => `${i},0`) })).rejects.toThrow();
  expect(f.reads.size).toBe(0);
});
