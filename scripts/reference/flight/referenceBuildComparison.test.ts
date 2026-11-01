import { describe, expect, test } from "bun:test";

import { withTolerance } from "./flightComparison";
import { compareReferenceBuilds, failingRows } from "./referenceBuildComparison";

describe("compareReferenceBuilds", () => {
  test("every runtime reference airframe flies within its tolerance of the reference sim", () => {
    const tables = compareReferenceBuilds();
    expect(tables.map((table) => table.aircraft)).toEqual([
      "Cessna 172N (aircraftFromReference)",
      "F-16 (aircraftFromReference)",
      "F-16 (aircraftFromReference)",
      "Bo-105 (aircraftFromReference)",
      "Saturn V S-IC (aircraftFromReference)",
    ]);
    const judged = tables.flatMap((table) => table.rows.filter((row) => row.allowed !== undefined));
    expect(judged.length).toBeGreaterThanOrEqual(8 + 8 + 6 + 7 + 5);
    expect(failingRows(tables)).toEqual([]);
  }, 120_000);

  test("a metric that drifts past its tolerance fails", () => {
    expect(withTolerance({ game: 1.11, reference: 1 }, 0.1).pass).toBe(false);
    expect(withTolerance({ game: 0.91, reference: 1 }, 0.1).pass).toBe(true);
    expect(withTolerance({ game: Number.NaN, reference: 1 }, 0.1).pass).toBe(false);
    expect(withTolerance({ game: Number.NaN, reference: Number.NaN }, 0.1).pass).toBe(true);
    expect(withTolerance({ game: 2, reference: 1 }, undefined).pass).toBeUndefined();
    expect(failingRows([{ aircraft: "jet", reference: "ref", rows: [withTolerance({ label: "climb", unit: "m/s", game: 80, reference: 119, real: undefined }, 0.1)] }])).toEqual(["jet: climb"]);
  });
});
