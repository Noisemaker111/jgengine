import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";

import { world } from "../world";

describe("loop-station world", () => {
  if (world.kind !== "environment") throw new Error("expected an environment() world");
  const summary = summarizeEnvironment(world);

  test("renders a populated scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("has finite terrain height", () => {
    expect(summary.terrain?.height.finite).toBe(true);
  });

  test("terrain bounds match the authored track footprint", () => {
    expect(summary.terrain?.bounds).toEqual({ w: 220, d: 220 });
  });

  test("declares a sky descriptor", () => {
    expect(world.sky?.preset).toBe("night");
  });
});
