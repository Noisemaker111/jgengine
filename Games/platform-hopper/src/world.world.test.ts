import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";

import { world } from "./world";

describe("platform-hopper world", () => {
  const summary = summarizeEnvironment(world);

  test("renders a populated scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("has the expected backdrop content", () => {
    expect(summary.counts.terrain).toBe(1);
    expect(summary.counts.buildings).toBe(6);
    expect(summary.counts.vegetationFields).toBe(1);
  });

  test("terrain resolves to a finite ground plane", () => {
    expect(summary.terrain?.height.finite).toBe(true);
  });
});
