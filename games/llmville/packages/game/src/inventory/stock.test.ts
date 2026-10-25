import { describe, expect, test } from "bun:test";

import type { GameRuntimeSnapshot } from "@jgengine/core/runtime/snapshot";
import {
  STOCK_ID,
  countsToSlots,
  readSnapshotStock,
  slotsToCounts,
  writeSnapshotStock,
} from "@llmville/game/inventory/stock";

function snapshot(inventories: Record<string, { item: string; count: number }[]>): GameRuntimeSnapshot {
  return {
    version: 1,
    gameId: "llmville",
    serverId: "server_1",
    server: { entities: [], objects: [], session: {} },
    players: { user_1: { userId: "user_1", inventories, economy: {}, unlocks: [] } },
    chunks: {},
    revision: 0,
    dirty: { server: false, players: [], chunks: [] },
  };
}

describe("stock slot conversion", () => {
  test("drops zero and negative counts", () => {
    expect(countsToSlots({ gpu_1: 2, gpu_2: 0, gpu_3: -1, gpu_4: undefined })).toEqual([
      { item: "gpu_1", count: 2 },
    ]);
  });

  test("sums duplicate slots back into counts", () => {
    expect(slotsToCounts([{ item: "gpu_1", count: 2 }, { item: "gpu_1", count: 3 }])).toEqual({ gpu_1: 5 });
    expect(slotsToCounts(undefined)).toEqual({});
  });
});

describe("snapshot stock", () => {
  test("reads a missing stock as empty", () => {
    expect(readSnapshotStock(snapshot({}), "user_1", STOCK_ID.build)).toEqual({});
    expect(readSnapshotStock(snapshot({}), "ghost", STOCK_ID.build)).toEqual({});
  });

  test("writes a stock and marks the player dirty", () => {
    const next = writeSnapshotStock(snapshot({}), "user_1", STOCK_ID.hardware, { gpu_1: 3 });
    expect(readSnapshotStock(next, "user_1", STOCK_ID.hardware)).toEqual({ gpu_1: 3 });
    expect(next.dirty.players).toEqual(["user_1"]);
    expect(next.dirty.server).toBe(true);
  });

  test("leaves other stocks untouched", () => {
    const start = snapshot({ [STOCK_ID.build]: [{ item: "starter_rack", count: 1 }] });
    const next = writeSnapshotStock(start, "user_1", STOCK_ID.cooling, { basic_rack_fan: 2 });
    expect(readSnapshotStock(next, "user_1", STOCK_ID.build)).toEqual({ starter_rack: 1 });
    expect(readSnapshotStock(next, "user_1", STOCK_ID.cooling)).toEqual({ basic_rack_fan: 2 });
  });

  test("an unknown player is not invented", () => {
    const start = snapshot({});
    expect(writeSnapshotStock(start, "ghost", STOCK_ID.build, { starter_rack: 1 })).toBe(start);
  });
});
