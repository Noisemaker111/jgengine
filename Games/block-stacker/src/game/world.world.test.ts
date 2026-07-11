import { describe, expect, test } from "bun:test";

import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";
import { TERRAIN_MATERIAL_PALETTES } from "@jgengine/core/world/terrain";

import { world } from "../world";

describe("block-stacker world", () => {
  const summary = summarizeEnvironment(world);

  test("renders a populated backdrop scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("has terrain with finite relief", () => {
    expect(summary.counts.terrain).toBe(1);
    expect(summary.terrain?.height.finite).toBe(true);
    expect(summary.terrain?.height.max).toBeGreaterThan(summary.terrain?.height.min ?? 0);
  });

  test("terrain uses the slate palette", () => {
    expect(summary.terrain?.palette).toEqual(TERRAIN_MATERIAL_PALETTES.slate);
  });

  test("places the industrial tower structures and weather", () => {
    expect(summary.counts.buildings).toBe(6);
    expect(summary.counts.buildingParts).toBeGreaterThan(0);
    expect(summary.counts.weatherSystems).toBe(1);
    expect(summary.structures[0]?.style).toBe("industrial");
  });
});
