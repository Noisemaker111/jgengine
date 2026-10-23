import { describe, expect, test } from "bun:test";

import { buildSpatialBuckets } from "./spatialBuckets";

describe("buildSpatialBuckets", () => {
  test("returns the ids whose rectangle overlaps the query box, ascending and once each", () => {
    const buckets = buildSpatialBuckets(10);
    buckets.insert(2, 0, 0, 5, 5);
    buckets.insert(0, 4, 4, 25, 25);
    buckets.insert(1, -30, -30, -20, -20);
    const out: number[] = [];
    expect(buckets.query(4, 4, 6, 6, out)).toEqual([0, 2]);
    expect(buckets.query(100, 100, 101, 101, out)).toEqual([]);
    // Cell 0 covers [-0, 10) both axes, so item 0 (from x=4) is in the same cell as the query corner.
    expect(buckets.query(-40, -40, 0, 0, out)).toEqual([0, 1, 2]);
  });

  test("an item spanning many cells is reported once", () => {
    const buckets = buildSpatialBuckets(4);
    buckets.insert(7, -100, -100, 100, 100);
    const out: number[] = [];
    expect(buckets.query(-10, -10, 10, 10, out)).toEqual([7]);
    expect(buckets.query(-200, -200, -150, -150, out)).toEqual([]);
  });

  test("reuses the caller's array and grows its mark table past the first 16 ids", () => {
    const buckets = buildSpatialBuckets(1);
    for (let id = 0; id < 200; id += 1) buckets.insert(id, id * 10, 0, id * 10 + 1, 1);
    const out = [999];
    const hits = buckets.query(1500, 0, 1501, 0, out);
    expect(hits).toBe(out);
    expect(out).toEqual([150]);
  });

  test("an inverted rectangle registers nothing", () => {
    const buckets = buildSpatialBuckets(5);
    buckets.insert(3, 0, 0, -1, -1);
    const out: number[] = [];
    expect(buckets.query(-10, -10, 10, 10, out)).toEqual([]);
  });
});
