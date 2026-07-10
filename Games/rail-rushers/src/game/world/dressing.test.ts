import { describe, expect, test } from "bun:test";
import { generateTracksideProps } from "./dressing";

describe("trackside prop dressing", () => {
  test("hits the 100+ placed-object content budget", () => {
    expect(generateTracksideProps().length).toBeGreaterThanOrEqual(100);
  });

  test("is deterministic for a fixed seed", () => {
    const a = generateTracksideProps("seed-a");
    const b = generateTracksideProps("seed-a");
    expect(a).toEqual(b);
  });

  test("a different seed produces a different layout", () => {
    const a = generateTracksideProps("seed-a");
    const b = generateTracksideProps("seed-b");
    expect(a).not.toEqual(b);
  });

  test("every placement has a finite, on-map position and unique instance id", () => {
    const placements = generateTracksideProps();
    const ids = new Set(placements.map((p) => p.instanceId));
    expect(ids.size).toBe(placements.length);
    for (const p of placements) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.z)).toBe(true);
      expect(p.scale).toBeGreaterThan(0);
    }
  });
});
