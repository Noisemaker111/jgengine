import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";
import { world } from "../world";

describe("magnet-run world", () => {
  if (world.kind !== "environment") throw new Error("expected an environment() world");
  const summary = summarizeEnvironment(world);

  test("renders a populated scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("has the expected terrain and structure content", () => {
    expect(summary.terrain?.height.finite).toBe(true);
    expect(summary.counts.terrain).toBe(1);
    expect(summary.counts.structureGroups).toBe(3);
    expect(summary.counts.buildings).toBeGreaterThanOrEqual(6);
  });
});
