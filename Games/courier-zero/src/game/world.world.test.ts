import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";
import { VILLAGES } from "./world/villages";
import { world } from "../world";

describe("courier-zero world", () => {
  const summary = summarizeEnvironment(world);

  test("renders a populated scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("has terrain with real relief", () => {
    expect(summary.terrain?.height.finite).toBe(true);
    expect(summary.terrain!.height.max).toBeGreaterThan(summary.terrain!.height.min);
  });

  test("has buildings across all four villages", () => {
    const expectedBuildings = VILLAGES.reduce((sum, village) => sum + village.buildingCount, 0);
    expect(summary.counts.structureGroups).toBe(VILLAGES.length);
    expect(summary.counts.buildings).toBe(expectedBuildings);
  });

  test("has ocean water present", () => {
    expect(summary.counts.waterBodies).toBeGreaterThan(0);
  });
});
