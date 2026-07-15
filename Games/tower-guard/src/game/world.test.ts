import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";
import { TERRAIN_MATERIAL_PALETTES } from "@jgengine/core/world/terrain";

import { world } from "../world";
import { TERRAIN } from "./world/terrain";

describe("tower-guard world", () => {
  test("world is an environment feature", () => {
    expect(world.kind).toBe("environment");
  });

  const summary = summarizeEnvironment(world.kind === "environment" ? world : { kind: "environment" });

  test("renders a populated, non-empty scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("declares terrain and vegetation", () => {
    expect(summary.counts.terrain).toBe(1);
    expect(summary.counts.vegetationFields).toBe(1);
  });

  test("terrain has finite relief", () => {
    expect(summary.terrain?.height.finite).toBe(true);
    expect(summary.terrain?.height.max).toBeGreaterThan(summary.terrain?.height.min ?? 0);
  });

  test("terrain uses this game's own warm palette, not an engine default", () => {
    expect(summary.terrain?.palette.low).toBe("#4d6a33");
    expect(summary.terrain?.palette).not.toEqual(TERRAIN_MATERIAL_PALETTES.grass);
    expect(summary.terrain?.palette).not.toEqual(TERRAIN_MATERIAL_PALETTES.highland);
  });

  test("terrain declares a textured detail surface and painted regions", () => {
    expect(TERRAIN.detail).toBeDefined();
    expect(TERRAIN.materialRegions?.length ?? 0).toBeGreaterThan(0);
  });
});
