import { describe, expect, test } from "bun:test";

import { buildSpatialBuckets, type SpatialBuckets } from "./spatialBuckets";

/** The ids one query wrote, read up to the count it returned. */
function ids(buckets: SpatialBuckets, minX: number, minZ: number, maxX: number, maxZ: number, out: number[]): number[] {
  return out.slice(0, buckets.query(minX, minZ, maxX, maxZ, out));
}

describe("buildSpatialBuckets", () => {
  test("returns the ids whose rectangle overlaps the query box, ascending and once each", () => {
    const buckets = buildSpatialBuckets(10);
    buckets.insert(2, 0, 0, 5, 5);
    buckets.insert(0, 4, 4, 25, 25);
    buckets.insert(1, -30, -30, -20, -20);
    const out: number[] = [];
    expect(ids(buckets, 4, 4, 6, 6, out)).toEqual([0, 2]);
    expect(ids(buckets, 100, 100, 101, 101, out)).toEqual([]);
    // Cell 0 covers [-0, 10) both axes, so item 0 (from x=4) is in the same cell as the query corner.
    expect(ids(buckets, -40, -40, 0, 0, out)).toEqual([0, 1, 2]);
  });

  test("an item spanning many cells is reported once", () => {
    const buckets = buildSpatialBuckets(4);
    buckets.insert(7, -100, -100, 100, 100);
    const out: number[] = [];
    expect(ids(buckets, -10, -10, 10, 10, out)).toEqual([7]);
    expect(ids(buckets, -200, -200, -150, -150, out)).toEqual([]);
  });

  test("writes into the caller's array without shrinking it, and grows its mark table past the first 16 ids", () => {
    const buckets = buildSpatialBuckets(1);
    for (let id = 0; id < 200; id += 1) buckets.insert(id, id * 10, 0, id * 10 + 1, 1);
    const out = [999, 998, 997];
    expect(buckets.query(1500, 0, 1501, 0, out)).toBe(1);
    expect(out).toEqual([150, 998, 997]);
    expect(buckets.query(-50, -50, -40, -40, out)).toBe(0);
    expect(out.length).toBe(3);
  });

  test("more than 64 ids come back sorted too", () => {
    const buckets = buildSpatialBuckets(1);
    for (let id = 99; id >= 0; id -= 1) buckets.insert(id, (99 - id) * 2, 0, (99 - id) * 2 + 1, 1);
    const out: number[] = [];
    expect(ids(buckets, 0, 0, 200, 1, out)).toEqual(Array.from({ length: 100 }, (_, id) => id));
  });

  test("an inverted rectangle registers nothing", () => {
    const buckets = buildSpatialBuckets(5);
    buckets.insert(3, 0, 0, -1, -1);
    const out: number[] = [];
    expect(ids(buckets, -10, -10, 10, 10, out)).toEqual([]);
  });
});
