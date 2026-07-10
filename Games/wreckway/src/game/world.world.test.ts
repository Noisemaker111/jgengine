import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";

import { world } from "../world";

describe("wreckway world", () => {
  const summary = summarizeEnvironment(world);

  test("renders a populated scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("three zones of canyon walls exceed the content floor", () => {
    expect(summary.counts.structureGroups).toBe(6);
    expect(summary.counts.buildings).toBeGreaterThan(30);
  });

  test("terrain resolves finite height everywhere", () => {
    expect(summary.terrain?.height.finite).toBe(true);
    expect(summary.terrain?.height.max).toBeGreaterThan(summary.terrain?.height.min ?? 0);
  });
});
