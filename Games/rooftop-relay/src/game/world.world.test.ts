import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";

import { world } from "../world";

describe("rooftop-relay world", () => {
  const summary = summarizeEnvironment(world);

  test("renders a populated scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("has the expected backdrop district content", () => {
    expect(summary.counts.buildings).toBe(20);
    expect(summary.counts.structureGroups).toBe(5);
  });

  test("street terrain is finite and flat — falling off a roof always has a floor", () => {
    expect(summary.terrain?.height.finite).toBe(true);
    expect(summary.terrain?.height.min).toBe(0);
    expect(summary.terrain?.height.max).toBe(0);
  });
});
