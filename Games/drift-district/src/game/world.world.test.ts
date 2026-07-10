import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";

import { world } from "../world";

describe("drift district world", () => {
  const summary = summarizeEnvironment(world);

  test("renders a populated scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("three districts of buildings exceed the content floor", () => {
    expect(summary.counts.buildings).toBeGreaterThan(20);
    expect(summary.counts.structureGroups).toBe(3);
  });

  test("terrain resolves finite height everywhere", () => {
    expect(summary.terrain?.height.finite).toBe(true);
  });
});
