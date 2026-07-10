import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";
import { FARMSTEADS, world } from "../world";

describe("stormline world", () => {
  const summary = summarizeEnvironment(world);

  test("renders a populated scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("has farmstead building clusters at every waypoint", () => {
    expect(summary.structures.length).toBe(FARMSTEADS.length);
    expect(summary.counts.buildings).toBeGreaterThanOrEqual(FARMSTEADS.reduce((sum, f) => sum + f.count, 0));
  });

  test("has finite terrain relief", () => {
    expect(summary.terrain?.height.finite).toBe(true);
    expect(summary.terrain!.height.max).toBeGreaterThan(summary.terrain!.height.min);
  });

  test("has the storm's rain weather feature present", () => {
    expect(summary.weather.length).toBeGreaterThan(0);
    expect(summary.weather.some((w) => w.kind === "rain")).toBe(true);
  });

  test("has prairie vegetation dressing", () => {
    expect(summary.vegetation.length).toBeGreaterThan(0);
  });
});
