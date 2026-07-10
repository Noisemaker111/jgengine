import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";
import { world } from "../world";
import { BUILDING_CLUSTERS } from "./course/track";

describe("tideway world", () => {
  const summary = summarizeEnvironment(world);

  test("renders a populated scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("has terrain with finite relief", () => {
    expect(summary.terrain?.height.finite).toBe(true);
    expect(summary.terrain?.height.max).toBeGreaterThan(summary.terrain?.height.min ?? 0);
  });

  test("has one ocean body at the harbor waterline", () => {
    expect(summary.counts.waterBodies).toBe(1);
    expect(summary.water[0]?.level).toBe(0);
  });

  test("has harbor building clusters on the shore", () => {
    expect(summary.counts.structureGroups).toBe(BUILDING_CLUSTERS.length);
    const expectedBuildings = BUILDING_CLUSTERS.reduce((sum, cluster) => sum + cluster.count, 0);
    expect(summary.counts.buildings).toBe(expectedBuildings);
  });
});
