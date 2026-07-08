import { describe, expect, test } from "bun:test";

import { building, environment, grass, ocean, rain, snow, terrain } from "./features";
import { resolveStructureBuildings, summarizeEnvironment } from "./environmentSummary";

describe("environmentSummary", () => {
  test("an empty environment resolves to nothing renderable", () => {
    const summary = summarizeEnvironment(environment());
    expect(summary.isEmpty).toBe(true);
    expect(summary.counts).toEqual({
      terrain: 0,
      structureGroups: 0,
      buildings: 0,
      buildingParts: 0,
      vegetationFields: 0,
      waterBodies: 0,
      weatherSystems: 0,
    });
  });

  test("counts every declared feature exactly once", () => {
    const summary = summarizeEnvironment(
      environment({
        terrain: terrain({ bounds: { w: 200, d: 200 }, height: 4, seed: "world" }),
        vegetation: grass({ area: { w: 100, d: 100 }, density: 5 }),
        water: ocean({ level: -1 }),
        weather: [rain(), snow()],
        structures: building({ count: 6, seed: "world" }),
      }),
    );
    expect(summary.isEmpty).toBe(false);
    expect(summary.counts.terrain).toBe(1);
    expect(summary.counts.vegetationFields).toBe(1);
    expect(summary.counts.waterBodies).toBe(1);
    expect(summary.counts.weatherSystems).toBe(2);
    expect(summary.weather.map((entry) => entry.kind)).toEqual(["rain", "snow"]);
  });

  test("structures resolve to real buildings with geometry", () => {
    const summary = summarizeEnvironment(
      environment({ structures: building({ count: 6, footprint: { w: 12, d: 9 }, seed: "showcase" }) }),
    );
    const [group] = summary.structures;
    expect(group?.requested).toBe(6);
    expect(group?.buildings).toBe(6);
    expect(summary.counts.buildings).toBe(6);
    expect(group?.parts).toBeGreaterThan(0);
    expect(group?.bounds.maxX).toBeGreaterThan(group?.bounds.minX ?? 0);
  });

  test("a seeded terrain produces finite, non-flat height", () => {
    const summary = summarizeEnvironment(
      environment({ terrain: terrain({ bounds: { w: 220, d: 220 }, height: 4, frequency: 0.035, seed: "showcase" }) }),
    );
    expect(summary.terrain?.height.finite).toBe(true);
    expect(summary.terrain?.height.max).toBeGreaterThan(summary.terrain?.height.min ?? 0);
  });

  test("terrain height is flat when no descriptor asks for relief", () => {
    const summary = summarizeEnvironment(
      environment({ terrain: terrain({ bounds: { w: 64, d: 64 }, height: 0 }) }),
    );
    expect(summary.terrain?.height.min).toBe(0);
    expect(summary.terrain?.height.max).toBe(0);
  });

  test("summaries are deterministic for a fixed seed", () => {
    const feature = environment({
      terrain: terrain({ bounds: { w: 128, d: 128 }, height: 3, seed: "det" }),
      structures: building({ count: 4, seed: "det" }),
    });
    expect(summarizeEnvironment(feature)).toEqual(summarizeEnvironment(feature));
  });

  test("building layout resolution matches the summarized building count", () => {
    const descriptor = building({ count: 9, footprint: { w: 10, d: 8 }, spacing: 4, seed: "grid" });
    expect(resolveStructureBuildings(descriptor)).toHaveLength(9);
  });

  test("building position sites the cluster away from the origin", () => {
    const config = { count: 9, footprint: { w: 10, d: 8 }, spacing: 4, seed: "grid" } as const;
    const centered = summarizeEnvironment(environment({ structures: building(config) })).structures[0];
    const sited = summarizeEnvironment(
      environment({ structures: building({ ...config, position: [200, -150] }) }),
    ).structures[0];
    expect(sited.bounds.minX).toBeCloseTo(centered.bounds.minX + 200, 6);
    expect(sited.bounds.maxX).toBeCloseTo(centered.bounds.maxX + 200, 6);
    expect(sited.bounds.minZ).toBeCloseTo(centered.bounds.minZ - 150, 6);
    expect(sited.bounds.maxZ).toBeCloseTo(centered.bounds.maxZ - 150, 6);
    expect(sited.buildings).toBe(centered.buildings);
  });

  test("distinct sited clusters do not overlap", () => {
    const summary = summarizeEnvironment(
      environment({
        structures: [
          building({ count: 4, seed: "a", position: [-120, 0] }),
          building({ count: 4, seed: "b", position: [120, 0] }),
        ],
      }),
    );
    const [west, east] = summary.structures;
    expect(west.bounds.maxX).toBeLessThan(east.bounds.minX);
  });
});
