import { describe, expect, test } from "bun:test";

import { HAUL_ROAD_HALF_WIDTH } from "../run/constants";
import { ZONES } from "../zones/catalog";
import { surfaceAt, surfaceFrictionAt } from "./surface";

const ZONE_SAMPLES: readonly (readonly [string, number])[] = [
  ["snacks", 60],
  ["frozen", 200],
  ["bulk", 360],
];

describe("Aisle 9 floor surfaces", () => {
  test("the tiled walkway uses each zone's authored floor grip", () => {
    for (const [id, z] of ZONE_SAMPLES) {
      const zone = ZONES.find((entry) => entry.id === id)!;
      const sample = surfaceAt(0, z);
      expect(sample.paved).toBe(true);
      expect(sample.zone.id).toBe(zone.surface.id);
      expect(sample.grip).toBeCloseTo(zone.surface.grip, 6);
      expect(sample.label).toBe(zone.surface.label);
    }
  });

  test("the sections really do differ: the frozen aisle is ice, mopped vinyl grips best, dusty concrete between", () => {
    const vinyl = surfaceAt(0, 60).grip;
    const ice = surfaceAt(0, 200).grip;
    const concrete = surfaceAt(0, 360).grip;
    expect(vinyl).toBeGreaterThan(concrete);
    expect(concrete).toBeGreaterThan(ice);
    expect(ice).toBeLessThan(0.9);
  });

  test("the terrazzo beside the tiled walkway grips less, and the edge fades instead of stepping", () => {
    const paved = surfaceAt(0, 200);
    const edge = surfaceAt(HAUL_ROAD_HALF_WIDTH - 0.01, 200);
    const justOver = surfaceAt(HAUL_ROAD_HALF_WIDTH + 0.05, 200);
    const shoulder = surfaceAt(15, 200);
    expect(edge.grip).toBeCloseTo(paved.grip, 6);
    expect(justOver.grip).toBeLessThan(edge.grip);
    expect(justOver.grip).toBeGreaterThan(shoulder.grip);
    expect(shoulder.paved).toBe(false);
    expect(shoulder.label).toContain("SHOULDER");
    expect(shoulder.grip).toBeLessThan(paved.grip * 0.9);
  });

  test("surfaceFrictionAt is symmetric in x and never returns a runaway multiplier", () => {
    for (const x of [0, 5, 9, 15, 18.5, 40]) {
      expect(surfaceFrictionAt(x, 200)).toBeCloseTo(surfaceFrictionAt(-x, 200), 9);
      expect(surfaceFrictionAt(x, 200)).toBeGreaterThan(0.5);
      expect(surfaceFrictionAt(x, 200)).toBeLessThanOrEqual(1);
    }
  });
});
