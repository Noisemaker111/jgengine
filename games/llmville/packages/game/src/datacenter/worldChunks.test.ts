import { describe, expect, test } from "bun:test";

import {
  MAX_WORLD_CHUNKS_PER_QUERY,
  MAX_WORLD_CHUNK_QUERY_RADIUS,
  WORLD_CHUNK_SIZE,
  clampWorldChunkQueryRadius,
  parseWorldChunkKey,
  worldChunkCenterOfKey,
  worldChunkCoordAt,
  worldChunkKeyAt,
  worldChunkKeyOf,
  worldChunkKeysInRadius,
} from "@llmville/game/datacenter/worldChunks";

describe("world chunk keys", () => {
  test("maps world positions to chunk cells at the declared size", () => {
    expect(WORLD_CHUNK_SIZE).toBe(64);
    expect(worldChunkCoordAt({ x: 0, z: 0 })).toEqual({ cx: 0, cz: 0 });
    expect(worldChunkCoordAt({ x: 63.9, z: 63.9 })).toEqual({ cx: 0, cz: 0 });
    expect(worldChunkCoordAt({ x: 64, z: 128 })).toEqual({ cx: 1, cz: 2 });
    expect(worldChunkCoordAt({ x: -1, z: -65 })).toEqual({ cx: -1, cz: -2 });
  });

  test("round-trips a key through parse", () => {
    for (const point of [
      { x: 0, y: 0, z: 0 },
      { x: 200.25, y: 3, z: -4000.5 },
      { x: -64, y: 0, z: 64 },
    ]) {
      const key = worldChunkKeyAt(point);
      const coord = parseWorldChunkKey(key);
      expect(coord).not.toBeNull();
      expect(worldChunkKeyOf(coord!)).toBe(key);
      expect(coord).toEqual(worldChunkCoordAt(point));
    }
  });

  test("rejects a key that is not chunk-shaped", () => {
    expect(parseWorldChunkKey("nope")).toBeNull();
  });

  test("two points in the same chunk share a key", () => {
    expect(worldChunkKeyAt({ x: 1, z: 1 })).toBe(worldChunkKeyAt({ x: 63, z: 63 }));
    expect(worldChunkKeyAt({ x: 1, z: 1 })).not.toBe(worldChunkKeyAt({ x: 65, z: 1 }));
  });
});

describe("chunk query radius ceiling", () => {
  test("clamps any radius to the query ceiling", () => {
    expect(clampWorldChunkQueryRadius(10)).toBe(10);
    expect(clampWorldChunkQueryRadius(-5)).toBe(0);
    expect(clampWorldChunkQueryRadius(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampWorldChunkQueryRadius(100_000)).toBe(MAX_WORLD_CHUNK_QUERY_RADIUS);
  });

  test("never returns more keys than one query can read", () => {
    for (const radius of [0, 1, 64, 192, 448, 5000]) {
      for (const center of [
        { x: 0, z: 0 },
        { x: 31.5, z: 63.9 },
        { x: -1234.5, z: 987.25 },
      ]) {
        const keys = worldChunkKeysInRadius(center, radius);
        expect(keys.length).toBeLessThanOrEqual(MAX_WORLD_CHUNKS_PER_QUERY);
      }
    }
  });

  test("covers the viewer's own chunk", () => {
    const center = { x: 100, z: -100 };
    expect(worldChunkKeysInRadius(center, 32)).toContain(worldChunkKeyAt(center));
  });
});

describe("worldChunkCenterOfKey", () => {
  test("quantises any position in a chunk to that chunk's single center", () => {
    const centers = [
      { x: 0.1, z: 0.1 },
      { x: 63.9, z: 63.9 },
      { x: 32, z: 32 },
    ].map((point) => worldChunkCenterOfKey(worldChunkKeyAt(point)));
    for (const center of centers) expect(center).toEqual(centers[0]!);
  });

  test("the center it returns lands back in the chunk it came from", () => {
    for (const point of [
      { x: 0, z: 0 },
      { x: -1, z: -1 },
      { x: 1234.5, z: -987.25 },
      { x: -64, z: 64 },
    ]) {
      const key = worldChunkKeyAt(point);
      expect(worldChunkKeyAt(worldChunkCenterOfKey(key))).toBe(key);
    }
  });

  test("a full-radius query around the center still covers the whole chunk", () => {
    const key = worldChunkKeyAt({ x: -300, z: 220 });
    const keys = worldChunkKeysInRadius(worldChunkCenterOfKey(key), MAX_WORLD_CHUNK_QUERY_RADIUS);
    expect(keys).toContain(key);
    expect(keys.length).toBeLessThanOrEqual(MAX_WORLD_CHUNKS_PER_QUERY);
  });

  test("falls back to the origin chunk for an unparsable key", () => {
    expect(worldChunkCenterOfKey("not-a-chunk")).toEqual({ x: 32, z: 32 });
  });
});
