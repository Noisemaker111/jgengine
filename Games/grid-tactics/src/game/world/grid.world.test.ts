import { describe, expect, test } from "bun:test";

import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";

import { world } from "../../world";

describe("grid-tactics battlefield world", () => {
  test("summarizeEnvironment reports real terrain and vegetation, never an empty scene", () => {
    const summary = summarizeEnvironment(world);
    expect(summary.isEmpty).toBe(false);
    expect(summary.counts.terrain).toBe(1);
    expect(summary.terrain?.height.finite).toBe(true);
    expect(summary.terrain?.bounds.w).toBeGreaterThan(0);
    expect(summary.counts.vegetationFields).toBeGreaterThan(0);
  });

  test("has a distinct muted tactics-board palette, not the default grass preset", () => {
    const summary = summarizeEnvironment(world);
    expect(summary.terrain?.palette).toEqual({ low: "#3d4a3a", high: "#7d8a68", waterline: "#35404a" });
  });
});
