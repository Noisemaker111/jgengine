import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";
import { world } from "../world";

describe("neon-shepherd world", () => {
  const summary = summarizeEnvironment(world);

  test("renders a populated scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("has finite, non-flat terrain", () => {
    expect(summary.terrain?.height.finite).toBe(true);
    expect(summary.terrain!.height.max).toBeGreaterThan(summary.terrain!.height.min);
  });

  test("has the expected structure groups and buildings", () => {
    expect(summary.counts.structureGroups).toBe(6);
    expect(summary.counts.buildings).toBeGreaterThanOrEqual(18);
  });

  test("has the sanctuary reflecting pool", () => {
    expect(summary.counts.waterBodies).toBe(1);
  });

  test("has ambient weather", () => {
    expect(summary.counts.weatherSystems).toBe(1);
  });
});
