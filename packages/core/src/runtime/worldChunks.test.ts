import { expect, test } from "bun:test";

import { createRuntimeSnapshot } from "./snapshot";
import {
  chunkCoordAt,
  chunkKeyAt,
  chunkKeyOf,
  chunkKeysInRadius,
  chunkKeysAround,
  createEmptyChunkRow,
  deleteChunk,
  parseChunkKey,
  setChunk,
  updateChunk,
} from "./worldChunks";

test("chunk keys round-trip and floor toward negative infinity", () => {
  expect(chunkKeyAt([0, 0, 0], 64)).toBe("0,0");
  expect(chunkKeyAt([63.9, 12, 64], 64)).toBe("0,1");
  expect(chunkCoordAt([-1, 0, -65], 64)).toEqual({ cx: -1, cz: -2 });
  expect(parseChunkKey(chunkKeyOf({ cx: -3, cz: 7 }))).toEqual({ cx: -3, cz: 7 });
  expect(parseChunkKey("nope")).toBeNull();
  expect(parseChunkKey("1,2,3")).toBeNull();
});

test("chunkKeysInRadius covers every cell the radius touches", () => {
  expect(chunkKeysInRadius([32, 0, 32], 1, 64)).toEqual(["0,0"]);
  expect(chunkKeysInRadius([0, 0, 0], 64, 64).sort()).toEqual(
    ["-1,-1", "-1,0", "-1,1", "0,-1", "0,0", "0,1", "1,-1", "1,0", "1,1"].sort(),
  );
});

test("setChunk marks the key dirty so a persist actually stores it", () => {
  const base = createRuntimeSnapshot({ gameId: "demo", serverId: "srv-1" });
  const next = setChunk(base, "0,0", createEmptyChunkRow("0,0"));

  expect(next.dirty.chunks).toEqual(["0,0"]);
  expect(next.dirty.server).toBe(true);
  expect(next.revision).toBe(base.revision + 1);
  expect(base.dirty.chunks).toEqual([]);
});

test("updateChunk faults in an empty chunk and deleteChunk marks the key for removal", () => {
  const base = createRuntimeSnapshot({ gameId: "demo", serverId: "srv-1" });
  const placed = updateChunk(base, "2,-1", (chunk) => ({
    ...chunk,
    objects: [{ instanceId: "rack-1", catalogId: "rack", position: [1, 0, 1] }],
  }));
  expect(placed.chunks["2,-1"]?.objects).toHaveLength(1);

  const removed = deleteChunk(placed, "2,-1");
  expect(removed.chunks["2,-1"]).toBeUndefined();
  expect(removed.dirty.chunks).toEqual(["2,-1"]);
});

test("chunk neighborhoods cross negative coordinates and reject unbounded inputs", () => {
  expect(chunkKeysAround([-1, 0, -1], 0)).toEqual(["-1,-1"]);
  expect(chunkKeysAround([63, 0, 63])).toEqual(["-1,-1", "-1,0", "-1,1", "0,-1", "0,0", "0,1", "1,-1", "1,0", "1,1"]);
  expect(() => chunkKeysAround([0, 0, 0], Infinity)).toThrow();
  expect(() => chunkKeysAround([NaN, 0, 0])).toThrow();
});
