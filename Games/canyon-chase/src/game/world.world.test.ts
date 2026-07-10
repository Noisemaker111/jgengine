import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";
import { world } from "../world";

describe("canyon-chase world", () => {
  const summary = summarizeEnvironment(world);

  test("renders a populated scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("has the expected outpost building count", () => {
    expect(summary.counts.buildings).toBe(5);
  });

  test("has finite, non-flat terrain relief", () => {
    expect(summary.terrain?.height.finite).toBe(true);
    expect(summary.terrain !== undefined && summary.terrain.height.max > summary.terrain.height.min).toBe(true);
  });
});
