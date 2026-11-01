import { describe, expect, test } from "bun:test";

import { windField } from "@jgengine/core/world/wind";

import { compareWind } from "./windComparison";

describe("compareWind", () => {
  test("the runtime field at strength 1 holds the EN 1991-1-4 mean profile, gust sigma and spectrum within 10% on every surface", () => {
    const failed = compareWind().filter((row) => !row.pass);
    expect(failed).toEqual([]);
  });

  test("a field that drifts from the reference fails", () => {
    const rows = compareWind({
      classes: ["grass"],
      heights: [2, 50],
      build: (surface, speed) => windField({ direction: [1, 0], speed, seed: "drift", effects: { surface, profile: { strength: 1.6 }, gusts: { strength: 1.3 } } }),
    });
    expect(rows.some((row) => row.label.includes("mean speed") && !row.pass)).toBe(true);
    expect(rows.some((row) => row.label.includes("gust sigma") && !row.pass)).toBe(true);
  });

  test("the plain field with no effects is reported, not passed", () => {
    const rows = compareWind({ classes: ["city"], heights: [100], build: (_surface, speed) => windField({ direction: [1, 0], speed }) });
    expect(rows.every((row) => !row.pass)).toBe(true);
  });
});
