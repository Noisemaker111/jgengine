import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";

import { world } from "../world";

describe("dune-nomads world", () => {
  const summary = summarizeEnvironment(world);

  test("renders a populated scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("has the expected building count across oases, ruins, and the city", () => {
    expect(summary.counts.buildings).toBe(48);
    expect(summary.counts.structureGroups).toBe(10);
  });

  test("has five oasis water bodies", () => {
    expect(summary.counts.waterBodies).toBe(5);
  });

  test("terrain resolves finite height with real dune amplitude", () => {
    expect(summary.terrain?.height.finite).toBe(true);
    const height = summary.terrain?.height;
    expect(height).toBeDefined();
    expect(height!.max - height!.min).toBeGreaterThan(5);
  });
});
