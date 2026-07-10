import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";
import { world } from "../world";

describe("craterball world", () => {
  const summary = summarizeEnvironment(world as Parameters<typeof summarizeEnvironment>[0]);

  test("renders a populated scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("has a finite flat pitch terrain field", () => {
    expect(summary.terrain?.height.finite).toBe(true);
    expect(summary.terrain?.height.min).toBe(0);
    expect(summary.terrain?.height.max).toBe(0);
  });

  test("has no static structures — dressing is placed as scene objects", () => {
    expect(summary.counts.buildings).toBe(0);
  });
});
