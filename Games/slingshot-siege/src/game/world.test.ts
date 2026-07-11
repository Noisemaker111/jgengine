import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";
import { world } from "../world";

describe("slingshot siege world", () => {
  if (world.kind !== "environment") throw new Error("expected an environment() world");
  const summary = summarizeEnvironment(world);

  test("renders a populated backdrop, not an empty scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("has a flat, finite terrain wide enough for the firing range", () => {
    expect(summary.terrain?.height.finite).toBe(true);
    expect(summary.terrain?.height.min).toBe(0);
    expect(summary.terrain?.height.max).toBe(0);
    expect(summary.terrain?.bounds.w).toBeGreaterThanOrEqual(100);
  });

  test("has grass vegetation dressing the range", () => {
    expect(summary.counts.vegetationFields).toBe(1);
  });

  test("has no structures or water in the play area", () => {
    expect(summary.counts.buildings).toBe(0);
    expect(summary.counts.waterBodies).toBe(0);
  });

  test("has a distinct dusty-range palette, not the default grass preset", () => {
    expect(summary.terrain?.palette).toEqual({ low: "#5c4a2e", high: "#a8874f", waterline: "#1d4c6e" });
  });
});
