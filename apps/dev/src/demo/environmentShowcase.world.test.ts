import { describe, expect, test } from "bun:test";

import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";
import { resolveTerrainDetail } from "@jgengine/core/world/terrain";

import { showcaseEnvironment } from "./environmentShowcase";

describe("environmentShowcase world", () => {
  const summary = summarizeEnvironment(showcaseEnvironment);

  test("the showcase renders a populated scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("declares terrain, water, vegetation, weather, and structures", () => {
    expect(summary.counts.terrain).toBe(1);
    expect(summary.counts.waterBodies).toBe(1);
    expect(summary.counts.vegetationFields).toBe(1);
    expect(summary.counts.weatherSystems).toBe(1);
    expect(summary.counts.structureGroups).toBe(1);
  });

  test("resolves the six seeded buildings with real geometry", () => {
    expect(summary.counts.buildings).toBe(6);
    expect(summary.counts.buildingParts).toBeGreaterThan(0);
  });

  test("terrain has finite relief around the declared waterline", () => {
    expect(summary.terrain?.height.finite).toBe(true);
    expect(summary.terrain?.height.max).toBeGreaterThan(summary.terrain?.height.min ?? 0);
    expect(summary.terrain?.waterLevel).toBe(-1);
  });

  test("the ground carries a real PBR material from buildMaterialCatalog, not just the procedural look", () => {
    const terrain = showcaseEnvironment.terrain!;
    const detail = resolveTerrainDetail(terrain.detail!, terrain.waterLevel);
    expect(detail.material).toBeDefined();
    expect(detail.material?.maps.color).toContain("/materials/");
    expect(detail.material?.maps.normal).toContain("/materials/");
    expect(detail.material?.repeat).toBe(6);
    expect(detail.material?.strength).toBe(1);
  });
});
